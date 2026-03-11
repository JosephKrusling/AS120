#pragma once

#include <stdint.h>
#include <stdbool.h>
#include <driver/i2c_master.h>
#include <esp_err.h>

#define TCA9535_PORT_0 0x00
#define TCA9535_PORT_1 0x01

typedef struct {
    uint8_t address;
    i2c_master_dev_handle_t dev_handle;
    uint8_t output_port_0;
    uint8_t output_port_1;
    uint8_t config_port_0;  // 0=output, 1=input (hi-Z)
    uint8_t config_port_1;
} tca9535_t;

tca9535_t tca9535_create_and_register(uint8_t address, i2c_master_bus_handle_t *bus);
void tca9535_set_output(tca9535_t *tca, uint8_t port, uint8_t value);
uint8_t tca9535_get_input(tca9535_t *tca, uint8_t port);
void tca9535_set_polarity_inversion(tca9535_t *tca, uint8_t port, uint8_t value);
void tca9535_set_configuration(tca9535_t *tca, uint8_t port, uint8_t value);
void tca9535_set_output_pin(tca9535_t *tca, uint8_t pin, uint8_t value, bool flush);
void tca9535_set_pin_direction(tca9535_t *tca, uint8_t pin, bool is_input, bool flush);
