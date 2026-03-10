#include "http_server.h"
#include "as120.h"
#include "wifi.h"
#include "constants.h"

#include <string.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <esp_log.h>
#include <esp_http_server.h>
#include <esp_spiffs.h>
#include <esp_partition.h>
#include <esp_system.h>
#include <cJSON.h>

#define TAG "httpd"
#define MAX_REQ_BODY_SIZE 512

static httpd_handle_t s_server = NULL;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

static void set_cors_headers(httpd_req_t *req)
{
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Headers", "Content-Type");
}

static esp_err_t options_handler(httpd_req_t *req)
{
    set_cors_headers(req);
    httpd_resp_send(req, NULL, 0);
    return ESP_OK;
}

// Read full request body (up to MAX_REQ_BODY_SIZE). Returns allocated string or NULL.
static char *read_req_body(httpd_req_t *req)
{
    int total = req->content_len;
    if (total <= 0 || total > MAX_REQ_BODY_SIZE) {
        return NULL;
    }
    char *buf = malloc(total + 1);
    if (buf == NULL) return NULL;

    int received = 0;
    while (received < total) {
        int ret = httpd_req_recv(req, buf + received, total - received);
        if (ret <= 0) {
            free(buf);
            return NULL;
        }
        received += ret;
    }
    buf[total] = '\0';
    return buf;
}

// Parse motor index from URI like /api/motor/2/move → 2.  Returns -1 on failure.
static int parse_motor_id(const char *uri)
{
    // Find "/api/motor/" prefix then grab the digit
    const char *prefix = "/api/motor/";
    const char *p = strstr(uri, prefix);
    if (p == NULL) return -1;
    p += strlen(prefix);
    if (*p < '0' || *p > '3') return -1;
    return *p - '0';
}

static const char *get_content_type(const char *path)
{
    const char *ext = strrchr(path, '.');
    if (ext == NULL) return "application/octet-stream";
    // Strip .gz to look at real extension
    char clean[256];
    strncpy(clean, path, sizeof(clean) - 1);
    clean[sizeof(clean) - 1] = '\0';
    if (strcmp(ext, ".gz") == 0) {
        // Remove .gz and find the next extension
        char *gz_pos = strrchr(clean, '.');
        if (gz_pos) {
            *gz_pos = '\0';
            ext = strrchr(clean, '.');
            if (ext == NULL) return "application/octet-stream";
        }
    }

    if (strcmp(ext, ".html") == 0) return "text/html";
    if (strcmp(ext, ".css") == 0) return "text/css";
    if (strcmp(ext, ".js") == 0) return "application/javascript";
    if (strcmp(ext, ".json") == 0) return "application/json";
    if (strcmp(ext, ".png") == 0) return "image/png";
    if (strcmp(ext, ".jpg") == 0 || strcmp(ext, ".jpeg") == 0) return "image/jpeg";
    if (strcmp(ext, ".svg") == 0) return "image/svg+xml";
    if (strcmp(ext, ".ico") == 0) return "image/x-icon";
    if (strcmp(ext, ".woff") == 0) return "font/woff";
    if (strcmp(ext, ".woff2") == 0) return "font/woff2";
    if (strcmp(ext, ".ttf") == 0) return "font/ttf";
    return "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Static file serving (SPIFFS)
// ---------------------------------------------------------------------------

static esp_err_t serve_spiffs_file(httpd_req_t *req, const char *filepath)
{
    // Try .gz version first
    char gz_path[256];
    snprintf(gz_path, sizeof(gz_path), "%s.gz", filepath);

    struct stat st;
    bool is_gzip = false;
    const char *serve_path = filepath;

    if (stat(gz_path, &st) == 0) {
        serve_path = gz_path;
        is_gzip = true;
    } else if (stat(filepath, &st) != 0) {
        httpd_resp_send_404(req);
        return ESP_FAIL;
    }

    FILE *f = fopen(serve_path, "r");
    if (f == NULL) {
        httpd_resp_send_404(req);
        return ESP_FAIL;
    }

    httpd_resp_set_type(req, get_content_type(filepath));
    if (is_gzip) {
        httpd_resp_set_hdr(req, "Content-Encoding", "gzip");
    }
    set_cors_headers(req);

    char buf[512];
    size_t read_bytes;
    while ((read_bytes = fread(buf, 1, sizeof(buf), f)) > 0) {
        if (httpd_resp_send_chunk(req, buf, read_bytes) != ESP_OK) {
            fclose(f);
            httpd_resp_sendstr_chunk(req, NULL);
            return ESP_FAIL;
        }
    }
    fclose(f);
    httpd_resp_send_chunk(req, NULL, 0);
    return ESP_OK;
}

static esp_err_t index_handler(httpd_req_t *req)
{
    return serve_spiffs_file(req, "/spiffs/index.html");
}

static esp_err_t assets_handler(httpd_req_t *req)
{
    char filepath[600];
    snprintf(filepath, sizeof(filepath), "/spiffs%.512s", req->uri);
    // Strip query string if any
    char *q = strchr(filepath, '?');
    if (q) *q = '\0';
    return serve_spiffs_file(req, filepath);
}

// ---------------------------------------------------------------------------
// API: Status
// ---------------------------------------------------------------------------

static esp_err_t api_status_handler(httpd_req_t *req)
{
    set_cors_headers(req);
    httpd_resp_set_type(req, "application/json");

    char *buf = malloc(8192);
    if (buf == NULL) {
        httpd_resp_send_500(req);
        return ESP_FAIL;
    }

    int len = as120_get_status_json(&g_as120, buf, 8192);
    httpd_resp_send(req, buf, len);
    free(buf);
    return ESP_OK;
}

// ---------------------------------------------------------------------------
// API: Motor (unified handler for move/jog/home/config)
// ---------------------------------------------------------------------------

// Parse action from URI tail: /api/motor/{id}/{action}
static const char *parse_motor_action(const char *uri)
{
    const char *prefix = "/api/motor/";
    const char *p = strstr(uri, prefix);
    if (p == NULL) return NULL;
    p += strlen(prefix);
    // Skip motor index digit and '/'
    if (*p < '0' || *p > '3') return NULL;
    p++;
    if (*p != '/') return NULL;
    return p + 1; // points to "move", "jog", "home", or "config"
}

static esp_err_t api_motor_handler(httpd_req_t *req)
{
    set_cors_headers(req);
    httpd_resp_set_type(req, "application/json");

    int motor_idx = parse_motor_id(req->uri);
    if (motor_idx < 0 || motor_idx >= MOTOR_COUNT) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "{\"error\":\"invalid motor id\"}");
        return ESP_FAIL;
    }

    const char *action = parse_motor_action(req->uri);
    if (action == NULL) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "{\"error\":\"invalid action\"}");
        return ESP_FAIL;
    }

    // Home — no body needed
    if (strcmp(action, "home") == 0) {
        action_t a = {
            .type = ACTION_ABSOLUTE,
            .motor_idx = (uint8_t)motor_idx,
            .send_ok_on_completion = 0,
            .target = 0,
            .next = NULL,
        };
        as120_enqueue_action(&g_as120, a);
        httpd_resp_sendstr(req, "{\"ok\":true}");
        return ESP_OK;
    }

    // All other actions need a body
    char *body = read_req_body(req);
    if (body == NULL) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "{\"error\":\"invalid body\"}");
        return ESP_FAIL;
    }

    cJSON *json = cJSON_Parse(body);
    free(body);
    if (json == NULL) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "{\"error\":\"invalid json\"}");
        return ESP_FAIL;
    }

    if (strcmp(action, "move") == 0) {
        cJSON *pos = cJSON_GetObjectItem(json, "position");
        if (!cJSON_IsNumber(pos)) {
            cJSON_Delete(json);
            httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "{\"error\":\"missing position\"}");
            return ESP_FAIL;
        }
        action_t a = {
            .type = ACTION_ABSOLUTE,
            .motor_idx = (uint8_t)motor_idx,
            .send_ok_on_completion = 0,
            .target = (int64_t)pos->valuedouble,
            .next = NULL,
        };
        as120_enqueue_action(&g_as120, a);

    } else if (strcmp(action, "jog") == 0) {
        cJSON *steps = cJSON_GetObjectItem(json, "steps");
        if (!cJSON_IsNumber(steps)) {
            cJSON_Delete(json);
            httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "{\"error\":\"missing steps\"}");
            return ESP_FAIL;
        }
        int64_t step_val = (int64_t)steps->valuedouble;
        action_t a = {
            .type = step_val >= 0 ? ACTION_INCREMENT : ACTION_DECREMENT,
            .motor_idx = (uint8_t)motor_idx,
            .send_ok_on_completion = 0,
            .target = step_val >= 0 ? step_val : -step_val,
            .next = NULL,
        };
        as120_enqueue_action(&g_as120, a);

    } else if (strcmp(action, "config") == 0) {
        stepper_t *s = &g_as120.motors[motor_idx].stepper;
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

    } else {
        cJSON_Delete(json);
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "{\"error\":\"unknown action\"}");
        return ESP_FAIL;
    }

    cJSON_Delete(json);
    httpd_resp_sendstr(req, "{\"ok\":true}");
    return ESP_OK;
}

// ---------------------------------------------------------------------------
// API: Home all
// ---------------------------------------------------------------------------

static esp_err_t api_home_all_handler(httpd_req_t *req)
{
    set_cors_headers(req);
    httpd_resp_set_type(req, "application/json");

    for (int i = 0; i < MOTOR_COUNT; i++) {
        action_t a = {
            .type = ACTION_ABSOLUTE,
            .motor_idx = (uint8_t)i,
            .send_ok_on_completion = 0,
            .target = 0,
            .next = NULL,
        };
        as120_enqueue_action(&g_as120, a);
    }

    httpd_resp_sendstr(req, "{\"ok\":true}");
    return ESP_OK;
}

// ---------------------------------------------------------------------------
// API: Clear queue
// ---------------------------------------------------------------------------

static esp_err_t api_clear_queue_handler(httpd_req_t *req)
{
    set_cors_headers(req);
    httpd_resp_set_type(req, "application/json");
    as120_clear_queue(&g_as120);
    httpd_resp_sendstr(req, "{\"ok\":true}");
    return ESP_OK;
}

// ---------------------------------------------------------------------------
// API: WiFi scan
// ---------------------------------------------------------------------------

static esp_err_t api_wifi_scan_handler(httpd_req_t *req)
{
    set_cors_headers(req);
    httpd_resp_set_type(req, "application/json");

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

    char *json_str = cJSON_PrintUnformatted(arr);
    cJSON_Delete(arr);
    httpd_resp_sendstr(req, json_str);
    free(json_str);
    return ESP_OK;
}

// ---------------------------------------------------------------------------
// API: WiFi connect
// ---------------------------------------------------------------------------

static esp_err_t api_wifi_connect_handler(httpd_req_t *req)
{
    set_cors_headers(req);
    httpd_resp_set_type(req, "application/json");

    char *body = read_req_body(req);
    if (body == NULL) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "{\"error\":\"invalid body\"}");
        return ESP_FAIL;
    }

    cJSON *json = cJSON_Parse(body);
    free(body);
    if (json == NULL) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "{\"error\":\"invalid json\"}");
        return ESP_FAIL;
    }

    cJSON *ssid_json = cJSON_GetObjectItem(json, "ssid");
    cJSON *pass_json = cJSON_GetObjectItem(json, "password");

    if (!cJSON_IsString(ssid_json)) {
        cJSON_Delete(json);
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "{\"error\":\"missing ssid\"}");
        return ESP_FAIL;
    }

    const char *ssid = ssid_json->valuestring;
    const char *pass = cJSON_IsString(pass_json) ? pass_json->valuestring : "";

    esp_err_t err = wifi_connect_sta(ssid, pass);
    cJSON_Delete(json);

    if (err == ESP_OK) {
        httpd_resp_sendstr(req, "{\"ok\":true}");
    } else {
        httpd_resp_sendstr(req, "{\"ok\":false,\"error\":\"connection failed\"}");
    }
    return ESP_OK;
}

// ---------------------------------------------------------------------------
// API: WiFi status
// ---------------------------------------------------------------------------

static esp_err_t api_wifi_status_handler(httpd_req_t *req)
{
    set_cors_headers(req);
    httpd_resp_set_type(req, "application/json");

    wifi_status_t st = wifi_get_status();

    cJSON *json = cJSON_CreateObject();
    cJSON_AddBoolToObject(json, "connected", st.connected);
    cJSON_AddBoolToObject(json, "ap_mode", st.is_ap_mode);
    cJSON_AddStringToObject(json, "ssid", st.ssid);
    cJSON_AddStringToObject(json, "ip", st.ip);

    char *json_str = cJSON_PrintUnformatted(json);
    cJSON_Delete(json);
    httpd_resp_sendstr(req, json_str);
    free(json_str);
    return ESP_OK;
}

// ---------------------------------------------------------------------------
// API: WiFi reset (erase credentials, switch to AP mode)
// ---------------------------------------------------------------------------

static esp_err_t api_wifi_reset_handler(httpd_req_t *req)
{
    set_cors_headers(req);
    httpd_resp_set_type(req, "application/json");

    esp_err_t err = wifi_reset();
    if (err != ESP_OK) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR,
                            "{\"error\":\"wifi reset failed\"}");
        return ESP_FAIL;
    }

    httpd_resp_sendstr(req, "{\"ok\":true}");
    return ESP_OK;
}

// ---------------------------------------------------------------------------
// API: SPIFFS OTA (panel update)
// ---------------------------------------------------------------------------

static esp_err_t api_ota_spiffs_handler(httpd_req_t *req)
{
    set_cors_headers(req);
    httpd_resp_set_type(req, "application/json");

    int total_len = req->content_len;
    if (total_len <= 0) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "{\"error\":\"empty body\"}");
        return ESP_FAIL;
    }

    // Find the SPIFFS partition
    const esp_partition_t *part = esp_partition_find_first(
        ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_SPIFFS, NULL);
    if (part == NULL) {
        ESP_LOGE(TAG, "SPIFFS partition not found");
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "{\"error\":\"spiffs partition not found\"}");
        return ESP_FAIL;
    }

    if ((size_t)total_len > part->size) {
        ESP_LOGE(TAG, "Image too large: %d > %lu", total_len, (unsigned long)part->size);
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "{\"error\":\"image too large for partition\"}");
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "SPIFFS OTA: receiving %d bytes", total_len);

    // Unmount SPIFFS before erasing
    esp_vfs_spiffs_unregister(NULL);

    // Erase the partition
    esp_err_t err = esp_partition_erase_range(part, 0, part->size);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to erase SPIFFS partition: %s", esp_err_to_name(err));
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "{\"error\":\"erase failed\"}");
        return ESP_FAIL;
    }

    // Receive and write in chunks
    char *buf = malloc(4096);
    if (buf == NULL) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "{\"error\":\"out of memory\"}");
        return ESP_FAIL;
    }

    int received = 0;
    while (received < total_len) {
        int to_read = total_len - received;
        if (to_read > 4096) to_read = 4096;

        int ret = httpd_req_recv(req, buf, to_read);
        if (ret <= 0) {
            if (ret == HTTPD_SOCK_ERR_TIMEOUT) continue;
            ESP_LOGE(TAG, "Receive error at offset %d", received);
            free(buf);
            httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "{\"error\":\"receive failed\"}");
            return ESP_FAIL;
        }

        err = esp_partition_write(part, received, buf, ret);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "Write failed at offset %d: %s", received, esp_err_to_name(err));
            free(buf);
            httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "{\"error\":\"write failed\"}");
            return ESP_FAIL;
        }

        received += ret;
    }

    free(buf);
    ESP_LOGI(TAG, "SPIFFS OTA: wrote %d bytes successfully", received);

    httpd_resp_sendstr(req, "{\"ok\":true,\"message\":\"SPIFFS updated, rebooting...\"}");

    // Reboot after a short delay to let the response send
    vTaskDelay(pdMS_TO_TICKS(500));
    esp_restart();

    return ESP_OK; // unreachable
}

// ---------------------------------------------------------------------------
// API: Reboot
// ---------------------------------------------------------------------------

static esp_err_t api_reboot_handler(httpd_req_t *req)
{
    set_cors_headers(req);
    httpd_resp_set_type(req, "application/json");
    httpd_resp_sendstr(req, "{\"ok\":true,\"message\":\"rebooting...\"}");
    vTaskDelay(pdMS_TO_TICKS(500));
    esp_restart();
    return ESP_OK;
}

// ---------------------------------------------------------------------------
// SPIFFS init
// ---------------------------------------------------------------------------

static void init_spiffs(void)
{
    esp_vfs_spiffs_conf_t conf = {
        .base_path = "/spiffs",
        .partition_label = NULL,
        .max_files = 5,
        .format_if_mount_failed = true,
    };
    esp_err_t ret = esp_vfs_spiffs_register(&conf);
    if (ret != ESP_OK) {
        if (ret == ESP_FAIL) {
            ESP_LOGE(TAG, "Failed to mount SPIFFS");
        } else if (ret == ESP_ERR_NOT_FOUND) {
            ESP_LOGE(TAG, "SPIFFS partition not found");
        }
        return;
    }

    size_t total = 0, used = 0;
    esp_spiffs_info(NULL, &total, &used);
    ESP_LOGI(TAG, "SPIFFS: total=%zu, used=%zu", total, used);
}

// ---------------------------------------------------------------------------
// Server start/stop
// ---------------------------------------------------------------------------

esp_err_t http_server_start(void)
{
    init_spiffs();

    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.max_uri_handlers = 20;
    config.uri_match_fn = httpd_uri_match_wildcard;
    config.stack_size = 8192;

    esp_err_t err = httpd_start(&s_server, &config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to start HTTP server: %s", esp_err_to_name(err));
        return err;
    }

    // OPTIONS handler for CORS preflight (wildcard)
    httpd_uri_t options_uri = {
        .uri = "/api/*",
        .method = HTTP_OPTIONS,
        .handler = options_handler,
    };
    httpd_register_uri_handler(s_server, &options_uri);

    // API endpoints
    httpd_uri_t status_uri = {
        .uri = "/api/status",
        .method = HTTP_GET,
        .handler = api_status_handler,
    };
    httpd_register_uri_handler(s_server, &status_uri);

    httpd_uri_t motor_uri = {
        .uri = "/api/motor/*",
        .method = HTTP_POST,
        .handler = api_motor_handler,
    };
    httpd_register_uri_handler(s_server, &motor_uri);

    httpd_uri_t home_all_uri = {
        .uri = "/api/home",
        .method = HTTP_POST,
        .handler = api_home_all_handler,
    };
    httpd_register_uri_handler(s_server, &home_all_uri);

    httpd_uri_t clear_queue_uri = {
        .uri = "/api/queue/clear",
        .method = HTTP_POST,
        .handler = api_clear_queue_handler,
    };
    httpd_register_uri_handler(s_server, &clear_queue_uri);

    httpd_uri_t wifi_scan_uri = {
        .uri = "/api/wifi/scan",
        .method = HTTP_GET,
        .handler = api_wifi_scan_handler,
    };
    httpd_register_uri_handler(s_server, &wifi_scan_uri);

    httpd_uri_t wifi_connect_uri = {
        .uri = "/api/wifi/connect",
        .method = HTTP_POST,
        .handler = api_wifi_connect_handler,
    };
    httpd_register_uri_handler(s_server, &wifi_connect_uri);

    httpd_uri_t wifi_status_uri = {
        .uri = "/api/wifi/status",
        .method = HTTP_GET,
        .handler = api_wifi_status_handler,
    };
    httpd_register_uri_handler(s_server, &wifi_status_uri);

    httpd_uri_t wifi_reset_uri = {
        .uri = "/api/wifi/reset",
        .method = HTTP_POST,
        .handler = api_wifi_reset_handler,
    };
    httpd_register_uri_handler(s_server, &wifi_reset_uri);

    httpd_uri_t ota_spiffs_uri = {
        .uri = "/api/ota/spiffs",
        .method = HTTP_POST,
        .handler = api_ota_spiffs_handler,
    };
    httpd_register_uri_handler(s_server, &ota_spiffs_uri);

    httpd_uri_t reboot_uri = {
        .uri = "/api/reboot",
        .method = HTTP_POST,
        .handler = api_reboot_handler,
    };
    httpd_register_uri_handler(s_server, &reboot_uri);

    // Static file serving — assets wildcard
    httpd_uri_t assets_uri = {
        .uri = "/assets/*",
        .method = HTTP_GET,
        .handler = assets_handler,
    };
    httpd_register_uri_handler(s_server, &assets_uri);

    // Index — must be registered last (catch-all for SPA routing)
    httpd_uri_t index_uri = {
        .uri = "/*",
        .method = HTTP_GET,
        .handler = index_handler,
    };
    httpd_register_uri_handler(s_server, &index_uri);

    ESP_LOGI(TAG, "HTTP server started on port %d", config.server_port);
    return ESP_OK;
}

void http_server_stop(void)
{
    if (s_server) {
        httpd_stop(s_server);
        s_server = NULL;
        ESP_LOGI(TAG, "HTTP server stopped");
    }
}
