idf_component_register(
    SRCS
        "main.c"
        "as120.c"
        "stepper.c"
        "luavm.c"
        "blobs.c"
        "wifi.c"
        "http_server.c"
        "ble_server.c"
        "drivers/i2c_util.c"
        "drivers/dac7574.c"
        "drivers/tca9535.c"
        "rgb_led.c"
    INCLUDE_DIRS "."
    REQUIRES driver nvs_flash lua esp_wifi esp_http_server esp_netif bt spiffs json app_update
)
