#include "i2c_util.h"
#include <driver/i2c_master.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "../constants.h"

esp_err_t i2c_transmit_with_retries(i2c_master_dev_handle_t dev, const uint8_t *data, size_t len)
{
#ifdef CONFIG_SIMULATE_I2C
    return ESP_OK;
#else
    esp_err_t result = ESP_FAIL;
    for (int attempt = 0; attempt <= I2C_MAX_RETRIES; attempt++) {
        result = i2c_master_transmit(dev, data, len, I2C_TIMEOUT_MS);
        if (result == ESP_OK)
            return ESP_OK;
        vTaskDelay(pdMS_TO_TICKS(I2C_RETRY_DELAY_MS));
    }
    return result;
#endif
}
