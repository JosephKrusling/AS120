#pragma once

#include <stdint.h>
#include <stdbool.h>

void rgb_led_init(void);
void rgb_led_set(uint8_t r, uint8_t g, uint8_t b);
void rgb_led_off(void);
void rgb_led_rainbow_start(void);
void rgb_led_rainbow_stop(void);
bool rgb_led_is_override(void);
