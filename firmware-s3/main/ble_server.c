#include "ble_server.h"
#include "as120.h"
#include "wifi.h"
#include "constants.h"

#include <string.h>
#include <stdlib.h>
#include <esp_log.h>
#include <nvs_flash.h>
#include <cJSON.h>

#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>

#include <nimble/nimble_port.h>
#include <nimble/nimble_port_freertos.h>
#include <host/ble_hs.h>
#include <host/util/util.h>
#include <services/gap/ble_svc_gap.h>
#include <services/gatt/ble_svc_gatt.h>

#define TAG "ble"

// Service UUID:  a5120000-0001-4c48-4330-303030303030
// Status UUID:   a5120000-0002-4c48-4330-303030303030
// Command UUID:  a5120000-0003-4c48-4330-303030303030
// Response UUID: a5120000-0004-4c48-4330-303030303030

static const ble_uuid128_t svc_uuid =
    BLE_UUID128_INIT(0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x43,
                     0x48, 0x4c, 0x01, 0x00, 0x00, 0x00, 0x12, 0xa5);

static const ble_uuid128_t chr_status_uuid =
    BLE_UUID128_INIT(0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x43,
                     0x48, 0x4c, 0x02, 0x00, 0x00, 0x00, 0x12, 0xa5);

static const ble_uuid128_t chr_command_uuid =
    BLE_UUID128_INIT(0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x43,
                     0x48, 0x4c, 0x03, 0x00, 0x00, 0x00, 0x12, 0xa5);

static const ble_uuid128_t chr_response_uuid =
    BLE_UUID128_INIT(0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x43,
                     0x48, 0x4c, 0x04, 0x00, 0x00, 0x00, 0x12, 0xa5);

// Command queue — dispatch BLE commands off the NimBLE host task
// so blocking operations (WiFi scan, etc.) don't freeze the BLE stack
typedef struct {
    char *data;
    uint16_t len;
} ble_cmd_msg_t;

static QueueHandle_t s_cmd_queue = NULL;

static uint16_t s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
static uint16_t s_status_attr_handle;
static uint16_t s_response_attr_handle;
static bool s_status_notify_enabled = false;
static bool s_response_notify_enabled = false;
static uint8_t s_own_addr_type = BLE_OWN_ADDR_RANDOM;

// ---------------------------------------------------------------------------
// GATT access callbacks
// ---------------------------------------------------------------------------

static void send_chunked_notify(uint16_t conn_handle, uint16_t attr_handle,
                                const char *data, int data_len);

static int gatt_status_access(uint16_t conn_handle, uint16_t attr_handle,
                              struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    if (ctxt->op == BLE_GATT_ACCESS_OP_READ_CHR) {
        char buf[2048];
        int len = as120_get_status_json(&g_as120, buf, sizeof(buf));
        os_mbuf_append(ctxt->om, buf, len);
        return 0;
    }
    return BLE_ATT_ERR_UNLIKELY;
}

static void send_response(const char *json_str)
{
    if (s_conn_handle == BLE_HS_CONN_HANDLE_NONE || !s_response_notify_enabled) {
        return;
    }
    send_chunked_notify(s_conn_handle, s_response_attr_handle, json_str, strlen(json_str));
}

static void handle_ble_command(const char *data, uint16_t len)
{
    // Null-terminate safely
    char *buf = malloc(len + 1);
    if (buf == NULL) return;
    memcpy(buf, data, len);
    buf[len] = '\0';

    cJSON *json = cJSON_Parse(buf);
    free(buf);
    if (json == NULL) return;

    cJSON *cmd = cJSON_GetObjectItem(json, "cmd");
    if (!cJSON_IsString(cmd)) {
        cJSON_Delete(json);
        return;
    }

    const char *cmd_str = cmd->valuestring;

    if (strcmp(cmd_str, "move") == 0) {
        cJSON *motor = cJSON_GetObjectItem(json, "motor");
        cJSON *pos = cJSON_GetObjectItem(json, "position");
        if (cJSON_IsNumber(motor) && cJSON_IsNumber(pos)) {
            int idx = (int)motor->valuedouble;
            if (idx >= 0 && idx < MOTOR_COUNT) {
                action_t a = { ACTION_ABSOLUTE, (uint8_t)idx, 0, (int64_t)pos->valuedouble, NULL };
                as120_enqueue_action(&g_as120, a);
            }
        }
    } else if (strcmp(cmd_str, "jog") == 0) {
        cJSON *motor = cJSON_GetObjectItem(json, "motor");
        cJSON *steps = cJSON_GetObjectItem(json, "steps");
        if (cJSON_IsNumber(motor) && cJSON_IsNumber(steps)) {
            int idx = (int)motor->valuedouble;
            int64_t step_val = (int64_t)steps->valuedouble;
            if (idx >= 0 && idx < MOTOR_COUNT) {
                action_t a = {
                    .type = step_val >= 0 ? ACTION_INCREMENT : ACTION_DECREMENT,
                    .motor_idx = (uint8_t)idx,
                    .send_ok_on_completion = 0,
                    .target = step_val >= 0 ? step_val : -step_val,
                    .next = NULL,
                };
                as120_enqueue_action(&g_as120, a);
            }
        }
    } else if (strcmp(cmd_str, "home") == 0) {
        cJSON *motor = cJSON_GetObjectItem(json, "motor");
        if (cJSON_IsNumber(motor)) {
            int idx = (int)motor->valuedouble;
            if (idx >= 0 && idx < MOTOR_COUNT) {
                action_t a = { ACTION_ABSOLUTE, (uint8_t)idx, 0, 0, NULL };
                as120_enqueue_action(&g_as120, a);
            }
        }
    } else if (strcmp(cmd_str, "home_all") == 0) {
        for (int i = 0; i < MOTOR_COUNT; i++) {
            action_t a = { ACTION_ABSOLUTE, (uint8_t)i, 0, 0, NULL };
            as120_enqueue_action(&g_as120, a);
        }
    } else if (strcmp(cmd_str, "config") == 0) {
        cJSON *motor = cJSON_GetObjectItem(json, "motor");
        if (cJSON_IsNumber(motor)) {
            int idx = (int)motor->valuedouble;
            if (idx >= 0 && idx < MOTOR_COUNT) {
                stepper_t *s = &g_as120.motors[idx].stepper;
                cJSON *val;
                val = cJSON_GetObjectItem(json, "speed_max");
                if (cJSON_IsNumber(val)) s->speed_max = (int64_t)val->valuedouble;
                val = cJSON_GetObjectItem(json, "speed_min");
                if (cJSON_IsNumber(val)) s->speed_min = (int64_t)val->valuedouble;
                val = cJSON_GetObjectItem(json, "max_acceleration");
                if (cJSON_IsNumber(val)) s->max_acceleration = (int64_t)val->valuedouble;
                val = cJSON_GetObjectItem(json, "step_size");
                if (cJSON_IsNumber(val)) {
                    int ss = (int)val->valuedouble;
                    if (ss >= STEP_SIZE_FULL && ss <= STEP_SIZE_SIXTEENTH)
                        s->step_size = (step_size_t)ss;
                }
            }
        }
    } else if (strcmp(cmd_str, "wifi_scan") == 0) {
        wifi_scan_result_t results[20];
        int count = 0;
        wifi_scan(results, &count, 20);

        cJSON *arr = cJSON_CreateArray();
        for (int i = 0; i < count; i++) {
            cJSON *item = cJSON_CreateObject();
            cJSON_AddStringToObject(item, "ssid", results[i].ssid);
            cJSON_AddNumberToObject(item, "rssi", results[i].rssi);
            cJSON_AddItemToArray(arr, item);
        }
        char *resp = cJSON_PrintUnformatted(arr);
        cJSON_Delete(arr);
        send_response(resp);
        free(resp);
    } else if (strcmp(cmd_str, "wifi_connect") == 0) {
        cJSON *ssid_json = cJSON_GetObjectItem(json, "ssid");
        cJSON *pass_json = cJSON_GetObjectItem(json, "password");
        if (cJSON_IsString(ssid_json)) {
            const char *ssid = ssid_json->valuestring;
            const char *pass = cJSON_IsString(pass_json) ? pass_json->valuestring : "";
            esp_err_t err = wifi_connect_sta(ssid, pass);
            if (err == ESP_OK) {
                send_response("{\"ok\":true}");
            } else {
                send_response("{\"ok\":false,\"error\":\"connection failed\"}");
            }
        }
    }

    cJSON_Delete(json);
}

static int gatt_command_access(uint16_t conn_handle, uint16_t attr_handle,
                               struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    if (ctxt->op == BLE_GATT_ACCESS_OP_WRITE_CHR) {
        uint16_t om_len = OS_MBUF_PKTLEN(ctxt->om);
        if (om_len > 0 && om_len <= 512) {
            // Copy data and dispatch to command task (don't block NimBLE host)
            char *data = malloc(om_len);
            if (data) {
                uint16_t copied = 0;
                ble_hs_mbuf_to_flat(ctxt->om, data, om_len, &copied);
                ble_cmd_msg_t msg = { .data = data, .len = copied };
                if (xQueueSend(s_cmd_queue, &msg, 0) != pdTRUE) {
                    ESP_LOGW(TAG, "Command queue full, dropping");
                    free(data);
                }
            }
        }
        return 0;
    }
    return BLE_ATT_ERR_UNLIKELY;
}

static int gatt_response_access(uint16_t conn_handle, uint16_t attr_handle,
                                struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    // Response characteristic is notify-only, read returns empty
    if (ctxt->op == BLE_GATT_ACCESS_OP_READ_CHR) {
        return 0;
    }
    return BLE_ATT_ERR_UNLIKELY;
}

// ---------------------------------------------------------------------------
// GATT service definition
// ---------------------------------------------------------------------------

static const struct ble_gatt_svc_def gatt_svcs[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &svc_uuid.u,
        .characteristics = (struct ble_gatt_chr_def[]) {
            {
                // Status characteristic: read + notify
                .uuid = &chr_status_uuid.u,
                .access_cb = gatt_status_access,
                .val_handle = &s_status_attr_handle,
                .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_NOTIFY,
            },
            {
                // Command characteristic: write
                .uuid = &chr_command_uuid.u,
                .access_cb = gatt_command_access,
                .flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_NO_RSP,
            },
            {
                // Response characteristic: notify
                .uuid = &chr_response_uuid.u,
                .access_cb = gatt_response_access,
                .val_handle = &s_response_attr_handle,
                .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_NOTIFY,
            },
            { 0 }, // Terminator
        },
    },
    { 0 }, // Terminator
};

// ---------------------------------------------------------------------------
// GAP event handler
// ---------------------------------------------------------------------------

static void start_advertising(void);

static int gap_event_handler(struct ble_gap_event *event, void *arg)
{
    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        ESP_LOGI(TAG, "BLE %s, conn_handle=%d, status=%d",
                 event->connect.status == 0 ? "connected" : "connect failed",
                 event->connect.conn_handle, event->connect.status);
        if (event->connect.status == 0) {
            s_conn_handle = event->connect.conn_handle;

            // Initiate MTU exchange — critical for sending status JSON over notifications
            ble_att_set_preferred_mtu(512);
            int mtu_rc = ble_gattc_exchange_mtu(event->connect.conn_handle, NULL, NULL);
            ESP_LOGI(TAG, "MTU exchange initiated, rc=%d", mtu_rc);

            // Also request preferred connection parameters for Web Bluetooth
            struct ble_gap_upd_params params = {
                .itvl_min = 16,   // 20ms (16 * 1.25ms)
                .itvl_max = 32,   // 40ms
                .latency = 0,
                .supervision_timeout = 400, // 4s
                .min_ce_len = 0,
                .max_ce_len = 0,
            };
            ble_gap_update_params(event->connect.conn_handle, &params);
        } else {
            s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
            start_advertising();
        }
        break;

    case BLE_GAP_EVENT_CONN_UPDATE:
        ESP_LOGI(TAG, "Connection params updated, status=%d", event->conn_update.status);
        break;

    case BLE_GAP_EVENT_ENC_CHANGE:
        ESP_LOGI(TAG, "Encryption change, status=%d", event->enc_change.status);
        break;

    case BLE_GAP_EVENT_DISCONNECT:
        ESP_LOGI(TAG, "BLE disconnected, reason=%d", event->disconnect.reason);
        s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
        s_status_notify_enabled = false;
        s_response_notify_enabled = false;
        start_advertising();
        break;

    case BLE_GAP_EVENT_SUBSCRIBE:
        if (event->subscribe.attr_handle == s_status_attr_handle) {
            s_status_notify_enabled = event->subscribe.cur_notify;
            ESP_LOGI(TAG, "Status notifications %s",
                     s_status_notify_enabled ? "enabled" : "disabled");
        } else if (event->subscribe.attr_handle == s_response_attr_handle) {
            s_response_notify_enabled = event->subscribe.cur_notify;
            ESP_LOGI(TAG, "Response notifications %s",
                     s_response_notify_enabled ? "enabled" : "disabled");
        }
        break;

    case BLE_GAP_EVENT_ADV_COMPLETE:
        ESP_LOGI(TAG, "Advertising complete");
        start_advertising();
        break;

    case BLE_GAP_EVENT_MTU:
        ESP_LOGI(TAG, "MTU updated: conn=%d, mtu=%d",
                 event->mtu.conn_handle, event->mtu.value);
        break;

    default:
        break;
    }
    return 0;
}

static void start_advertising(void)
{
    struct ble_gap_adv_params adv_params = {0};
    adv_params.conn_mode = BLE_GAP_CONN_MODE_UND;
    adv_params.disc_mode = BLE_GAP_DISC_MODE_GEN;

    struct ble_hs_adv_fields fields = {0};
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    fields.name = (uint8_t *)ble_svc_gap_device_name();
    fields.name_len = strlen(ble_svc_gap_device_name());
    fields.name_is_complete = 1;
    fields.uuids128 = (ble_uuid128_t[]){ svc_uuid };
    fields.num_uuids128 = 1;
    fields.uuids128_is_complete = 1;

    int rc = ble_gap_adv_set_fields(&fields);
    if (rc != 0) {
        // If adv data too long, try without UUID in advertisement
        ESP_LOGW(TAG, "Adv fields too long (%d), retrying without UUID", rc);
        fields.uuids128 = NULL;
        fields.num_uuids128 = 0;
        fields.uuids128_is_complete = 0;
        rc = ble_gap_adv_set_fields(&fields);
        if (rc != 0) {
            ESP_LOGE(TAG, "Failed to set adv fields: %d", rc);
            return;
        }
        // Put UUID in scan response instead
        struct ble_hs_adv_fields rsp_fields = {0};
        rsp_fields.uuids128 = (ble_uuid128_t[]){ svc_uuid };
        rsp_fields.num_uuids128 = 1;
        rsp_fields.uuids128_is_complete = 1;
        ble_gap_adv_rsp_set_fields(&rsp_fields);
    }

    rc = ble_gap_adv_start(s_own_addr_type, NULL, BLE_HS_FOREVER,
                           &adv_params, gap_event_handler, NULL);
    if (rc != 0 && rc != BLE_HS_EALREADY) {
        ESP_LOGE(TAG, "Failed to start advertising: %d", rc);
    } else {
        ESP_LOGI(TAG, "BLE advertising started");
    }
}

// ---------------------------------------------------------------------------
// Status notification task (runs on core 1)
// ---------------------------------------------------------------------------

// Send chunked notification: [seq(1)] [total(1)] [data...]
static void send_chunked_notify(uint16_t conn_handle, uint16_t attr_handle,
                                const char *data, int data_len)
{
    uint16_t mtu = ble_att_mtu(conn_handle);
    uint16_t max_payload = mtu > 3 ? mtu - 3 : 20;
    uint16_t chunk_data_size = max_payload - 2; // 2 bytes header

    int total_chunks = (data_len + chunk_data_size - 1) / chunk_data_size;
    if (total_chunks > 255) total_chunks = 255;

    for (int i = 0; i < total_chunks; i++) {
        int offset = i * chunk_data_size;
        int remaining = data_len - offset;
        int chunk_len = remaining < (int)chunk_data_size ? remaining : (int)chunk_data_size;

        uint8_t header[2] = { (uint8_t)i, (uint8_t)total_chunks };
        struct os_mbuf *om = ble_hs_mbuf_from_flat(header, 2);
        if (om) {
            os_mbuf_append(om, data + offset, chunk_len);
            int rc = ble_gatts_notify_custom(conn_handle, attr_handle, om);
            if (rc != 0) {
                if (rc != BLE_HS_ENOTCONN) {
                    ESP_LOGW(TAG, "Chunk %d/%d notify failed: %d", i, total_chunks, rc);
                }
                return;
            }
        }
        // Small delay between chunks to avoid flooding
        if (i < total_chunks - 1) {
            vTaskDelay(pdMS_TO_TICKS(5));
        }
    }
}

static void ble_status_notify_task(void *param)
{
    char *buf = malloc(2048);
    if (buf == NULL) {
        ESP_LOGE(TAG, "Failed to allocate BLE status buffer");
        vTaskDelete(NULL);
        return;
    }

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(500));

        if (s_conn_handle == BLE_HS_CONN_HANDLE_NONE || !s_status_notify_enabled) {
            continue;
        }

        int len = as120_get_status_json(&g_as120, buf, 2048);
        send_chunked_notify(s_conn_handle, s_status_attr_handle, buf, len);
    }

    free(buf);
    vTaskDelete(NULL);
}

// ---------------------------------------------------------------------------
// Command processing task (runs commands off the NimBLE host task)
// ---------------------------------------------------------------------------

static void ble_command_task(void *param)
{
    ble_cmd_msg_t msg;
    while (1) {
        if (xQueueReceive(s_cmd_queue, &msg, portMAX_DELAY) == pdTRUE) {
            handle_ble_command(msg.data, msg.len);
            free(msg.data);
        }
    }
}

// ---------------------------------------------------------------------------
// NimBLE host sync callback
// ---------------------------------------------------------------------------

static void ble_on_sync(void)
{
    // Use random address — ESP32-S3 devkits often lack a public BLE address
    int rc = ble_hs_id_infer_auto(0, &s_own_addr_type);
    if (rc != 0) {
        ESP_LOGE(TAG, "Failed to infer BLE address type: %d", rc);
        return;
    }

    uint8_t addr[6] = {0};
    ble_hs_id_copy_addr(s_own_addr_type, addr, NULL);
    ESP_LOGI(TAG, "BLE address: %02x:%02x:%02x:%02x:%02x:%02x (type=%d)",
             addr[5], addr[4], addr[3], addr[2], addr[1], addr[0], s_own_addr_type);

    start_advertising();
}

static void ble_on_reset(int reason)
{
    ESP_LOGE(TAG, "BLE host reset, reason=%d", reason);
}

// ---------------------------------------------------------------------------
// NimBLE host task
// ---------------------------------------------------------------------------

static void nimble_host_task(void *param)
{
    ESP_LOGI(TAG, "NimBLE host task started");
    nimble_port_run(); // This blocks until nimble_port_stop()
    nimble_port_freertos_deinit();
}

// ---------------------------------------------------------------------------
// Public init
// ---------------------------------------------------------------------------

void ble_server_init(void)
{
    int rc;

    rc = nimble_port_init();
    if (rc != ESP_OK) {
        ESP_LOGE(TAG, "nimble_port_init failed: %d", rc);
        return;
    }

    // Configure NimBLE host
    ble_hs_cfg.reset_cb = ble_on_reset;
    ble_hs_cfg.sync_cb = ble_on_sync;
    ble_hs_cfg.gatts_register_cb = NULL;

    // Initialize GAP and GATT services
    ble_svc_gap_init();
    ble_svc_gatt_init();

    // Set device name
    rc = ble_svc_gap_device_name_set("AS120");
    if (rc != 0) {
        ESP_LOGE(TAG, "Failed to set device name: %d", rc);
    }

    // Register custom GATT services
    rc = ble_gatts_count_cfg(gatt_svcs);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gatts_count_cfg failed: %d", rc);
        return;
    }

    rc = ble_gatts_add_svcs(gatt_svcs);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gatts_add_svcs failed: %d", rc);
        return;
    }

    // Create command queue and processing task
    s_cmd_queue = xQueueCreate(8, sizeof(ble_cmd_msg_t));

    // Start NimBLE host task
    nimble_port_freertos_init(nimble_host_task);

    // Start status notification task on core 1
    xTaskCreatePinnedToCore(ble_status_notify_task, "ble_notify", 4096,
                            NULL, 5, NULL, 1);

    // Start command processing task (8KB stack for WiFi scan, etc.)
    xTaskCreatePinnedToCore(ble_command_task, "ble_cmd", 8192,
                            NULL, 5, NULL, 0);

    ESP_LOGI(TAG, "BLE server initialized");
}
