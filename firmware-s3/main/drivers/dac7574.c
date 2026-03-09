#include "dac7574.h"
#include "i2c_util.h"
#include "esp_log.h"

#define TAG "DAC7574"

// Control register modes
#define CTRL_UPDATE_CHANNEL 0x10
#define PWR_NORMAL          0x00

dac7574_t dac7574_create_and_register(uint8_t address, i2c_master_bus_handle_t *bus)
{
    i2c_master_dev_handle_t dev = NULL;
#ifndef CONFIG_SIMULATE_I2C
    i2c_device_config_t cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = address,
        .scl_speed_hz = 100000,
    };
    ESP_ERROR_CHECK(i2c_master_bus_add_device(*bus, &cfg, &dev));
#else
    ESP_LOGI(TAG, "Simulating DAC7574 at 0x%02X", address);
#endif

    return (dac7574_t){
        .address = address,
        .dev_handle = dev,
    };
}

esp_err_t dac7574_write_register(dac7574_t *dac, uint8_t reg, uint16_t value)
{
    uint8_t buf[3] = { reg, value >> 4, value << 4 };
    esp_err_t err = i2c_transmit_with_retries(dac->dev_handle, buf, 3);
    if (err != ESP_OK)
        ESP_LOGE(TAG, "Write failed reg=0x%02X addr=0x%02X: %s", reg, dac->address, esp_err_to_name(err));
    return err;
}

esp_err_t dac7574_set_channel_data(dac7574_t *dac, uint8_t channel, uint16_t value)
{
    uint8_t control = CTRL_UPDATE_CHANNEL | (channel & 0x03) << 1 | PWR_NORMAL;
    return dac7574_write_register(dac, control, value);
}

esp_err_t dac7574_set_current_limit(dac7574_t *dac, uint8_t channel, double current)
{
    // DRV8886AT current limit formula:
    // RREF=15k on board, Arref=30k, Vrref=1.232V
    // I = 30k * (1.232 - Vdac) / (1.232 * 15k)
    double v_max = 5.0;
    double v = 1.232 - current / 1.6234;
    uint8_t dac_value = (uint8_t)(v * 255.0 / v_max);
    ESP_LOGI(TAG, "ch=%d current=%.3f v=%.3f dac=%d", channel, current, v, dac_value);
    return dac7574_set_channel_data(dac, channel, dac_value);
}
