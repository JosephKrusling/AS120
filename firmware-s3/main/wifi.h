#pragma once

#include <stdbool.h>
#include <esp_err.h>
#include <esp_wifi_types.h>

typedef struct {
    char ssid[33];
    int8_t rssi;
} wifi_scan_result_t;

typedef struct {
    bool connected;
    bool is_ap_mode;
    char ssid[33];
    char ip[16];
} wifi_status_t;

// Initialize WiFi. Tries STA with stored creds, falls back to AP mode.
void wifi_init(void);

// Connect to a WiFi network in STA mode. Saves credentials to NVS on success.
esp_err_t wifi_connect_sta(const char *ssid, const char *password);

// Scan for available networks. Returns number of results found.
esp_err_t wifi_scan(wifi_scan_result_t *results, int *count, int max);

// Erase stored credentials and restart in AP mode.
esp_err_t wifi_reset(void);

// Get current WiFi status.
wifi_status_t wifi_get_status(void);
