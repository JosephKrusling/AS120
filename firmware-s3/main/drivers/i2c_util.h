#pragma once

#include <driver/i2c_types.h>
#include <esp_err.h>

esp_err_t i2c_transmit_with_retries(i2c_master_dev_handle_t dev, const uint8_t *data, size_t len);
