#include "rgb_led.h"
#include "constants.h"

#include <driver/rmt_tx.h>
#include <driver/rmt_encoder.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

static rmt_channel_handle_t s_chan;
static rmt_encoder_handle_t s_encoder;
static TaskHandle_t s_rainbow_task;

void rgb_led_init(void)
{
    rmt_tx_channel_config_t tx_cfg = {
        .gpio_num = PIN_STATUS_LED,
        .clk_src = RMT_CLK_SRC_DEFAULT,
        .resolution_hz = 10000000, // 10 MHz = 100ns per tick
        .mem_block_symbols = 64,
        .trans_queue_depth = 4,
    };
    rmt_new_tx_channel(&tx_cfg, &s_chan);

    rmt_bytes_encoder_config_t enc_cfg = {
        .bit0 = { .level0 = 1, .duration0 = 3, .level1 = 0, .duration1 = 9 },
        .bit1 = { .level0 = 1, .duration0 = 9, .level1 = 0, .duration1 = 3 },
        .flags.msb_first = 1,
    };
    rmt_new_bytes_encoder(&enc_cfg, &s_encoder);

    rmt_enable(s_chan);
}

void rgb_led_set(uint8_t r, uint8_t g, uint8_t b)
{
    uint8_t grb[3] = { g, r, b }; // WS2812 is GRB order
    rmt_transmit_config_t tx_cfg = { .loop_count = 0 };
    rmt_transmit(s_chan, s_encoder, grb, 3, &tx_cfg);
    rmt_tx_wait_all_done(s_chan, portMAX_DELAY);
}

void rgb_led_off(void)
{
    rgb_led_set(0, 0, 0);
}

// HSV to RGB. h: 0-359, s/v: 0-255.
static void hsv2rgb(uint16_t h, uint8_t s, uint8_t v,
                    uint8_t *r, uint8_t *g, uint8_t *b)
{
    h %= 360;
    uint8_t region = h / 60;
    uint8_t rem = (h % 60) * 255 / 60;
    uint8_t p = (v * (255 - s)) / 255;
    uint8_t q = (v * (255 - (s * rem) / 255)) / 255;
    uint8_t t = (v * (255 - (s * (255 - rem)) / 255)) / 255;
    switch (region) {
        case 0: *r = v; *g = t; *b = p; break;
        case 1: *r = q; *g = v; *b = p; break;
        case 2: *r = p; *g = v; *b = t; break;
        case 3: *r = p; *g = q; *b = v; break;
        case 4: *r = t; *g = p; *b = v; break;
        default: *r = v; *g = p; *b = q; break;
    }
}

static void ota_blink_task(void *arg)
{
    bool toggle = false;
    for (;;) {
        if (toggle) rgb_led_set(20, 6, 0);  // orange
        else        rgb_led_set(0, 4, 20);  // blue
        toggle = !toggle;
        vTaskDelay(pdMS_TO_TICKS(250));
    }
}

void rgb_led_rainbow_start(void)
{
    if (s_rainbow_task) return;
    xTaskCreate(ota_blink_task, "ota_led", 2048, NULL, 5, &s_rainbow_task);
}

void rgb_led_rainbow_stop(void)
{
    if (s_rainbow_task) {
        vTaskDelete(s_rainbow_task);
        s_rainbow_task = NULL;
    }
    rgb_led_off();
}

bool rgb_led_is_override(void)
{
    return s_rainbow_task != NULL;
}
