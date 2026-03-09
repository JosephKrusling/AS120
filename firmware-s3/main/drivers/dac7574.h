#pragma once

#include <stdint.h>
#include <driver/i2c_master.h>
#include <esp_err.h>

typedef struct {
    uint8_t address;
    i2c_master_dev_handle_t dev_handle;
} dac7574_t;

dac7574_t dac7574_create_and_register(uint8_t address, i2c_master_bus_handle_t *bus);
esp_err_t dac7574_write_register(dac7574_t *dac, uint8_t reg, uint16_t value);
esp_err_t dac7574_set_channel_data(dac7574_t *dac, uint8_t channel, uint16_t value);
esp_err_t dac7574_set_current_limit(dac7574_t *dac, uint8_t channel, double current);
