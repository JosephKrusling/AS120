#include "wifi.h"

#include <string.h>
#include <esp_log.h>
#include <esp_wifi.h>
#include <esp_netif.h>
#include <esp_event.h>
#include <nvs.h>
#include <freertos/FreeRTOS.h>
#include <freertos/event_groups.h>

#define TAG "wifi"

#define WIFI_NVS_NAMESPACE "wifi_cfg"
#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAIL_BIT      BIT1
#define WIFI_STA_TIMEOUT_MS 10000

static EventGroupHandle_t s_wifi_event_group;
static esp_netif_t *s_netif_sta = NULL;
static esp_netif_t *s_netif_ap = NULL;
static bool s_is_ap_mode = false;
static bool s_is_connected = false;
static char s_current_ssid[33] = {0};
static char s_current_ip[16] = {0};

static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                                int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT) {
        switch (event_id) {
        case WIFI_EVENT_STA_START:
            esp_wifi_connect();
            break;
        case WIFI_EVENT_STA_DISCONNECTED:
            s_is_connected = false;
            s_current_ip[0] = '\0';
            if (s_wifi_event_group) {
                xEventGroupSetBits(s_wifi_event_group, WIFI_FAIL_BIT);
            }
            ESP_LOGI(TAG, "STA disconnected");
            break;
        case WIFI_EVENT_AP_STACONNECTED:
            ESP_LOGI(TAG, "Station joined AP");
            break;
        case WIFI_EVENT_AP_STADISCONNECTED:
            ESP_LOGI(TAG, "Station left AP");
            break;
        default:
            break;
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        snprintf(s_current_ip, sizeof(s_current_ip), IPSTR, IP2STR(&event->ip_info.ip));
        ESP_LOGI(TAG, "Got IP: %s", s_current_ip);
        s_is_connected = true;
        if (s_wifi_event_group) {
            xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
        }
    }
}

static void start_ap_mode(void)
{
    ESP_LOGI(TAG, "Starting AP mode: SSID=AS120-Setup");

    if (s_netif_ap == NULL) {
        s_netif_ap = esp_netif_create_default_wifi_ap();
    }

    wifi_config_t ap_config = {
        .ap = {
            .ssid = "AS120-Setup",
            .ssid_len = strlen("AS120-Setup"),
            .channel = 1,
            .password = "",
            .max_connection = 4,
            .authmode = WIFI_AUTH_OPEN,
        },
    };

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    s_is_ap_mode = true;
    s_is_connected = false;
    strncpy(s_current_ssid, "AS120-Setup", sizeof(s_current_ssid));
    strncpy(s_current_ip, "192.168.4.1", sizeof(s_current_ip));

    ESP_LOGI(TAG, "AP mode started. IP: 192.168.4.1");
}

static bool try_sta_mode(const char *ssid, const char *password)
{
    ESP_LOGI(TAG, "Attempting STA connection to: %s", ssid);

    if (s_netif_sta == NULL) {
        s_netif_sta = esp_netif_create_default_wifi_sta();
    }

    wifi_config_t sta_config = {0};
    strncpy((char *)sta_config.sta.ssid, ssid, sizeof(sta_config.sta.ssid) - 1);
    strncpy((char *)sta_config.sta.password, password, sizeof(sta_config.sta.password) - 1);
    sta_config.sta.threshold.authmode = strlen(password) > 0 ? WIFI_AUTH_WPA2_PSK : WIFI_AUTH_OPEN;

    s_wifi_event_group = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &sta_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    // Wait for connection or timeout
    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group,
        WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
        pdFALSE, pdFALSE,
        pdMS_TO_TICKS(WIFI_STA_TIMEOUT_MS));

    bool connected = (bits & WIFI_CONNECTED_BIT) != 0;

    if (connected) {
        s_is_ap_mode = false;
        strncpy(s_current_ssid, ssid, sizeof(s_current_ssid));
        s_current_ssid[sizeof(s_current_ssid) - 1] = '\0';
        ESP_LOGI(TAG, "Connected to %s, IP: %s", ssid, s_current_ip);
    } else {
        ESP_LOGW(TAG, "Failed to connect to %s", ssid);
        esp_wifi_stop();
    }

    vEventGroupDelete(s_wifi_event_group);
    s_wifi_event_group = NULL;

    return connected;
}

static bool load_stored_credentials(char *ssid, size_t ssid_len, char *pass, size_t pass_len)
{
    nvs_handle_t handle;
    if (nvs_open(WIFI_NVS_NAMESPACE, NVS_READONLY, &handle) != ESP_OK) {
        return false;
    }

    size_t s_len = ssid_len;
    size_t p_len = pass_len;
    bool ok = (nvs_get_str(handle, "ssid", ssid, &s_len) == ESP_OK &&
               nvs_get_str(handle, "pass", pass, &p_len) == ESP_OK &&
               strlen(ssid) > 0);

    nvs_close(handle);
    return ok;
}

static void save_credentials(const char *ssid, const char *password)
{
    nvs_handle_t handle;
    if (nvs_open(WIFI_NVS_NAMESPACE, NVS_READWRITE, &handle) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open NVS for writing WiFi creds");
        return;
    }
    nvs_set_str(handle, "ssid", ssid);
    nvs_set_str(handle, "pass", password);
    nvs_commit(handle);
    nvs_close(handle);
    ESP_LOGI(TAG, "WiFi credentials saved");
}

void wifi_init(void)
{
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
        &wifi_event_handler, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
        &wifi_event_handler, NULL, NULL));

    // Try stored STA credentials first
    char ssid[33] = {0};
    char pass[65] = {0};
    if (load_stored_credentials(ssid, sizeof(ssid), pass, sizeof(pass))) {
        if (try_sta_mode(ssid, pass)) {
            return;
        }
    }

    // Fallback to AP mode
    start_ap_mode();
}

esp_err_t wifi_connect_sta(const char *ssid, const char *password)
{
    if (ssid == NULL || strlen(ssid) == 0) {
        return ESP_ERR_INVALID_ARG;
    }

    // Stop current WiFi
    esp_wifi_stop();
    s_is_connected = false;
    s_is_ap_mode = false;

    if (try_sta_mode(ssid, password ? password : "")) {
        save_credentials(ssid, password ? password : "");
        return ESP_OK;
    }

    // Failed — restart AP mode
    start_ap_mode();
    return ESP_FAIL;
}

esp_err_t wifi_scan(wifi_scan_result_t *results, int *count, int max)
{
    if (results == NULL || count == NULL || max <= 0) {
        return ESP_ERR_INVALID_ARG;
    }

    // If in AP mode, temporarily switch to APSTA for scanning
    wifi_mode_t current_mode;
    esp_wifi_get_mode(&current_mode);

    if (current_mode == WIFI_MODE_AP) {
        if (s_netif_sta == NULL) {
            s_netif_sta = esp_netif_create_default_wifi_sta();
        }
        esp_wifi_set_mode(WIFI_MODE_APSTA);
    }

    wifi_scan_config_t scan_config = {
        .show_hidden = false,
        .scan_type = WIFI_SCAN_TYPE_ACTIVE,
        .scan_time.active.min = 100,
        .scan_time.active.max = 300,
    };

    esp_err_t err = esp_wifi_scan_start(&scan_config, true);
    if (err != ESP_OK) {
        if (current_mode == WIFI_MODE_AP) {
            esp_wifi_set_mode(WIFI_MODE_AP);
        }
        *count = 0;
        return err;
    }

    uint16_t ap_count = 0;
    esp_wifi_scan_get_ap_num(&ap_count);

    uint16_t fetch_count = ap_count < (uint16_t)max ? ap_count : (uint16_t)max;
    wifi_ap_record_t *ap_records = malloc(sizeof(wifi_ap_record_t) * fetch_count);
    if (ap_records == NULL) {
        esp_wifi_scan_get_ap_records(&fetch_count, NULL); // clear scan results
        *count = 0;
        return ESP_ERR_NO_MEM;
    }

    esp_wifi_scan_get_ap_records(&fetch_count, ap_records);

    *count = (int)fetch_count;
    for (int i = 0; i < (int)fetch_count; i++) {
        strncpy(results[i].ssid, (const char *)ap_records[i].ssid, sizeof(results[i].ssid) - 1);
        results[i].ssid[sizeof(results[i].ssid) - 1] = '\0';
        results[i].rssi = ap_records[i].rssi;
    }

    free(ap_records);

    // Restore mode if we changed it
    if (current_mode == WIFI_MODE_AP) {
        esp_wifi_set_mode(WIFI_MODE_AP);
    }

    return ESP_OK;
}

esp_err_t wifi_reset(void)
{
    ESP_LOGI(TAG, "Resetting WiFi — erasing credentials and switching to AP mode");

    // Erase stored credentials
    nvs_handle_t handle;
    if (nvs_open(WIFI_NVS_NAMESPACE, NVS_READWRITE, &handle) == ESP_OK) {
        nvs_erase_all(handle);
        nvs_commit(handle);
        nvs_close(handle);
    }

    // Stop current WiFi and switch to AP mode
    esp_wifi_stop();
    s_is_connected = false;
    start_ap_mode();

    return ESP_OK;
}

wifi_status_t wifi_get_status(void)
{
    wifi_status_t status = {0};
    status.connected = s_is_connected;
    status.is_ap_mode = s_is_ap_mode;
    strncpy(status.ssid, s_current_ssid, sizeof(status.ssid));
    strncpy(status.ip, s_current_ip, sizeof(status.ip));
    return status;
}
