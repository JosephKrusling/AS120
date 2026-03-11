#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/gpio.h"
#include "driver/gptimer.h"
#include "driver/i2c_master.h"
#include "driver/uart.h"
#include "nvs_flash.h"
#include "esp_log.h"

#include "esp_timer.h"

#include "constants.h"
#include "as120.h"
#include "luavm.h"
#include "blobs.h"
#include "wifi.h"
#include "http_server.h"
#include "ble_server.h"
#include "rgb_led.h"

#define TAG "as120"

// ---------------------------------------------------------------------------
// Firmware log ring buffer — captures ESP_LOG output
// ---------------------------------------------------------------------------

fw_log_t g_fw_log;
static vprintf_like_t s_original_vprintf;

// Strip ANSI escape sequences in-place (e.g. \033[0;32m)
static void strip_ansi(char *str)
{
    char *read = str, *write = str;
    while (*read) {
        if (*read == '\033' && *(read + 1) == '[') {
            read += 2;
            while (*read && *read != 'm') read++;
            if (*read == 'm') read++;
        } else {
            *write++ = *read++;
        }
    }
    *write = '\0';
}

static int fw_log_vprintf(const char *fmt, va_list args)
{
    // Format into ring buffer entry
    fw_log_t *log = &g_fw_log;
    fw_log_entry_t *e = &log->entries[log->head];
    e->timestamp_ms = (uint32_t)(esp_timer_get_time() / 1000);

    va_list args_copy;
    va_copy(args_copy, args);
    vsnprintf(e->message, FW_LOG_MSG_MAX, fmt, args_copy);
    va_end(args_copy);

    // Strip ANSI color codes
    strip_ansi(e->message);

    // Strip trailing whitespace
    size_t len = strlen(e->message);
    while (len > 0 && (e->message[len - 1] == '\n' || e->message[len - 1] == '\r' || e->message[len - 1] == ' '))
        e->message[--len] = '\0';

    // Skip empty messages after stripping
    if (len == 0)
        return s_original_vprintf(fmt, args);

    log->head = (log->head + 1) % FW_LOG_MAX;
    if (log->count < FW_LOG_MAX) log->count++;
    log->seq++;

    // Still print to UART
    return s_original_vprintf(fmt, args);
}

static void init_gpio(void)
{
    // PIN_STATUS_LED is driven by RMT (rgb_led.c), not GPIO
    gpio_set_direction(PIN_STEP, GPIO_MODE_OUTPUT);
    gpio_set_direction(PIN_STEP_EXP, GPIO_MODE_OUTPUT);
    gpio_set_direction(PIN_DIR, GPIO_MODE_OUTPUT);
    gpio_set_direction(PIN_DIR_EXP, GPIO_MODE_OUTPUT);
    gpio_set_direction(PIN_I2C_SDA, GPIO_MODE_OUTPUT_OD);
    gpio_set_direction(PIN_I2C_SCL, GPIO_MODE_OUTPUT_OD);
    gpio_set_direction(PIN_HOME, GPIO_MODE_INPUT);
    gpio_set_pull_mode(PIN_HOME, GPIO_PULLUP_ONLY);
    gpio_set_direction(PIN_HOME_EXP, GPIO_MODE_INPUT);
    gpio_set_pull_mode(PIN_HOME_EXP, GPIO_PULLUP_ONLY);
}

static uart_port_t init_uart(void)
{
    // UART0: legacy 4-byte protocol comms (19200 baud)
    // UART1: debug logging (handled by ESP-IDF console config in sdkconfig)
    const uart_port_t port = UART_NUM_0;
    uart_config_t cfg = {
        .baud_rate = 19200,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
    };
    ESP_ERROR_CHECK(uart_param_config(port, &cfg));
    ESP_ERROR_CHECK(uart_set_pin(port, PIN_UART_TX, PIN_UART_RX, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE));

    QueueHandle_t queue;
    ESP_ERROR_CHECK(uart_driver_install(port, 1024, 1024, 10, &queue, 0));
    ESP_LOGI(TAG, "UART0 initialized (19200 baud)");
    return port;
}

static i2c_master_bus_handle_t init_i2c(void)
{
#ifdef CONFIG_SIMULATE_I2C
    ESP_LOGW(TAG, "I2C SIMULATION MODE — no hardware required");
    return NULL;
#else
    i2c_master_bus_config_t cfg = {
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .i2c_port = -1,
        .scl_io_num = PIN_I2C_SCL,
        .sda_io_num = PIN_I2C_SDA,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };
    i2c_master_bus_handle_t bus;
    ESP_ERROR_CHECK(i2c_new_master_bus(&cfg, &bus));
    ESP_LOGI(TAG, "I2C bus initialized");
    return bus;
#endif
}

static void init_nvs(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "Erasing NVS partition");
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);
    ESP_LOGI(TAG, "NVS initialized");
}

static gptimer_handle_t init_motor_timer(void)
{
    gptimer_handle_t timer = NULL;
    gptimer_config_t cfg = {
        .clk_src = GPTIMER_CLK_SRC_DEFAULT,
        .direction = GPTIMER_COUNT_UP,
        .resolution_hz = 1000000, // 1MHz → 1 tick = 1us
    };
    ESP_ERROR_CHECK(gptimer_new_timer(&cfg, &timer));

    gptimer_alarm_config_t alarm = {
        .reload_count = 0,
        .alarm_count = TIMER_INTR_US,
        .flags.auto_reload_on_alarm = true,
    };
    gptimer_event_callbacks_t cbs = {
        .on_alarm = stepper_interrupt_handler,
    };
    ESP_ERROR_CHECK(gptimer_register_event_callbacks(timer, &cbs, &g_as120));
    ESP_ERROR_CHECK(gptimer_set_alarm_action(timer, &alarm));
    ESP_ERROR_CHECK(gptimer_enable(timer));
    ESP_ERROR_CHECK(gptimer_start(timer));
    ESP_LOGI(TAG, "Motor timer started (%dus interval)", TIMER_INTR_US);
    return timer;
}

static void init_motors(as120_t *dev, i2c_master_bus_handle_t *bus)
{
    // GPIO expanders
    dev->gpio_main = tca9535_create_and_register(0x20, bus);
    tca9535_set_configuration(&dev->gpio_main, TCA9535_PORT_0, 0x00);
    tca9535_set_configuration(&dev->gpio_main, TCA9535_PORT_1, 0x00);

    dev->gpio_expansion = tca9535_create_and_register(0x25, bus);
    tca9535_set_configuration(&dev->gpio_expansion, TCA9535_PORT_0, 0x00);
    tca9535_set_configuration(&dev->gpio_expansion, TCA9535_PORT_1, 0x00);

    // DACs
    dev->dac_main = dac7574_create_and_register(0x4C, bus);
    dev->dac_expansion = dac7574_create_and_register(0x4D, bus);

    // Default stepper profile
    stepper_t base = stepper_new();
    base.speed_min = 100;
    base.speed_homing = 400;
    base.speed_max = 2000;
    base.max_acceleration = 8000;
    base.current_motion = 0.3;
    base.current_stationary = 0.05;
    base.step_size = STEP_SIZE_QUARTER;

    // Forward/Backward (expansion board)
    dev->motors[MOTOR_FORWARD_BACK] = (motor_t){
        .name = "FB", .index = 0,
        .stepper = stepper_copy(&base, 1),
        .pin_step = PIN_STEP_EXP, .pin_dir = PIN_DIR_EXP, .pin_home = PIN_HOME_EXP,
        .dac = &dev->dac_expansion, .dac_channel = 0,
        .gpio = &dev->gpio_expansion,
        .gpio_pin_drv_nflt = 0, .gpio_pin_drv_en = 1,
        .gpio_pin_drv_m0 = 2, .gpio_pin_drv_m1 = 3,
        .gpio_pin_disabled = 14,
        .invert_step_dir = true,
    };

    // Up/Down (expansion board)
    dev->motors[MOTOR_UP_DOWN] = (motor_t){
        .name = "UD", .index = 1,
        .stepper = stepper_copy(&base, 2),
        .pin_step = PIN_STEP_EXP, .pin_dir = PIN_DIR_EXP, .pin_home = PIN_HOME_EXP,
        .dac = &dev->dac_expansion, .dac_channel = 1,
        .gpio = &dev->gpio_expansion,
        .gpio_pin_drv_nflt = 4, .gpio_pin_drv_en = 5,
        .gpio_pin_drv_m0 = 6, .gpio_pin_drv_m1 = 7,
        .gpio_pin_disabled = 15,
        .invert_step_dir = false,
    };

    // Plunger (expansion board)
    dev->motors[MOTOR_PLUNGER] = (motor_t){
        .name = "PL", .index = 2,
        .stepper = stepper_copy(&base, 3),
        .pin_step = PIN_STEP_EXP, .pin_dir = PIN_DIR_EXP, .pin_home = PIN_HOME_EXP,
        .dac = &dev->dac_expansion, .dac_channel = 2,
        .gpio = &dev->gpio_expansion,
        .gpio_pin_drv_nflt = 10, .gpio_pin_drv_en = 11,
        .gpio_pin_drv_m0 = 12, .gpio_pin_drv_m1 = 13,
        .gpio_pin_disabled = 16,
        .invert_step_dir = false,
    };
    dev->motors[MOTOR_PLUNGER].stepper.speed_max = 400;

    // Left/Right (main board)
    dev->motors[MOTOR_RIGHT_LEFT] = (motor_t){
        .name = "LR", .index = 3,
        .stepper = stepper_copy(&base, 4),
        .pin_step = PIN_STEP, .pin_dir = PIN_DIR, .pin_home = PIN_HOME,
        .dac = &dev->dac_main, .dac_channel = 0,
        .gpio = &dev->gpio_main,
        .gpio_pin_drv_nflt = 0, .gpio_pin_drv_en = 1,
        .gpio_pin_drv_m0 = 2, .gpio_pin_drv_m1 = 3,
        .gpio_pin_disabled = 4,
        .invert_step_dir = true,
    };
}

void app_main(void)
{
    // Install log hook before any ESP_LOG calls
    s_original_vprintf = esp_log_set_vprintf(fw_log_vprintf);

    ESP_LOGI(TAG, "AS120-S3 v%d.%d.%d", VERSION_MAJOR, VERSION_MINOR, VERSION_PATCH);
    ESP_LOGI(TAG, "Reset reason: %d", esp_reset_reason());

    init_gpio();
    rgb_led_init();
    uart_port_t uart = init_uart();
    i2c_master_bus_handle_t i2c_bus = init_i2c();
    init_nvs();

    // Initialize device state
    g_as120 = (as120_t){
        .active_motor_index = -1,
        .uart_num = uart,
        .input_mode = INPUT_MODE_4BYTE,
        .fault_code = FAULT_NONE,
    };
    init_motors(&g_as120, &i2c_bus);
    init_motor_timer();

    wifi_init();
    http_server_start();
    ble_server_init();

    luavm_t vm = {
        .as120 = &g_as120,
    };

    // Main loop
    uint8_t led_tick = 0;
    uint8_t cmd_buf[4];
    int cmd_len = 0;

    while (1) {
        as120_process_next_action(&g_as120);

        size_t bytes_available = 0;
        ESP_ERROR_CHECK(uart_get_buffered_data_len(uart, &bytes_available));

        switch (g_as120.input_mode) {
        case INPUT_MODE_LUA:
            if (bytes_available >= 1) {
                char data[128];
                int n = uart_read_bytes(uart, data, bytes_available, 1);
                lua_handle_repl_input(&vm, data, n);
            }
            break;

        case INPUT_MODE_4BYTE:
            if (bytes_available >= 1) {
                uint8_t byte;
                uart_read_bytes(uart, &byte, 1, 1);

                // Ignore leading newlines
                if (cmd_len == 0 && byte == '\n')
                    break;

                cmd_buf[cmd_len++] = byte;
                if (cmd_len == 4) {
                    as120_log_serial(&g_as120, 0, cmd_buf, 4);
                    as120_handle_command(&g_as120, cmd_buf);
                    cmd_len = 0;
                }
            }
            break;

        case INPUT_MODE_SYSTEM_PARAM_BLOB:
            if (bytes_available >= SYSTEM_PARAMETERS_LENGTH) {
                uint8_t data[SYSTEM_PARAMETERS_LENGTH];
                uart_read_bytes(uart, data, SYSTEM_PARAMETERS_LENGTH, 1);
                uart_flush(uart);
                store_system_parameters(data);

                // Update plunger speed from params
                uint16_t speed = (data[26] << 8) | data[27];
                if (speed > 0)
                    g_as120.motors[MOTOR_PLUNGER].stepper.speed_max = speed;

                uart_write_bytes(uart, "ok\r", 3);
                g_as120.input_mode = INPUT_MODE_4BYTE;
            }
            break;

        case INPUT_MODE_METHOD_PARAM_BLOB:
            if (bytes_available >= METHOD_PARAMETERS_LENGTH) {
                uint8_t data[METHOD_PARAMETERS_LENGTH];
                uart_read_bytes(uart, data, METHOD_PARAMETERS_LENGTH, 1);
                uart_flush(uart);
                store_method_parameters(data, g_as120.method_page_number);
                uart_write_bytes(uart, "ok\r", 3);
                g_as120.input_mode = INPUT_MODE_4BYTE;
            }
            break;
        }

        // LED status: orange blink when moving, green heartbeat when idle
        // (skip when OTA blink task owns the LED)
        if (!rgb_led_is_override()) {
            if (g_as120.active_motor_index >= 0) {
                led_tick = (led_tick + 1) % 5;
                if (led_tick == 0) rgb_led_set(20, 6, 0);
                else if (led_tick == 2) rgb_led_off();
            } else {
                // Green heartbeat: 250ms on, 750ms off (10 ticks = 1s)
                led_tick = (led_tick + 1) % 10;
                if (led_tick == 0) rgb_led_set(0, 8, 0);
                else if (led_tick == 2) rgb_led_off();
            }
        }

        vTaskDelay(10);
    }
}
