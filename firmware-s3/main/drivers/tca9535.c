#include "tca9535.h"
#include "i2c_util.h"
#include "esp_log.h"

#define TAG "TCA9535"

static const uint8_t REG_INPUT          = 0x00;
static const uint8_t REG_OUTPUT         = 0x02;
static const uint8_t REG_POLARITY_INV   = 0x04;
static const uint8_t REG_CONFIGURATION  = 0x06;

static esp_err_t write_register(tca9535_t *tca, uint8_t reg, uint8_t port, uint8_t value)
{
    uint8_t buf[2] = { reg | port, value };
    return i2c_transmit_with_retries(tca->dev_handle, buf, 2);
}

static uint8_t read_register(tca9535_t *tca, uint8_t reg, uint8_t port)
{
#ifdef CONFIG_SIMULATE_I2C
    return 0;
#else
    uint8_t cmd = reg | port;
    uint8_t result = 0;
    i2c_master_transmit_receive(tca->dev_handle, &cmd, 1, &result, 1, 100);
    return result;
#endif
}

tca9535_t tca9535_create_and_register(uint8_t address, i2c_master_bus_handle_t *bus)
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
    ESP_LOGI(TAG, "Simulating TCA9535 at 0x%02X", address);
#endif

    return (tca9535_t){
        .address = address,
        .dev_handle = dev,
        .output_port_0 = 0,
        .output_port_1 = 0,
    };
}

void tca9535_set_output(tca9535_t *tca, uint8_t port, uint8_t value)
{
    if (port == TCA9535_PORT_0)
        tca->output_port_0 = value;
    else
        tca->output_port_1 = value;
    write_register(tca, REG_OUTPUT, port, value);
}

uint8_t tca9535_get_input(tca9535_t *tca, uint8_t port)
{
    return read_register(tca, REG_INPUT, port);
}

void tca9535_set_polarity_inversion(tca9535_t *tca, uint8_t port, uint8_t value)
{
    write_register(tca, REG_POLARITY_INV, port, value);
}

void tca9535_set_configuration(tca9535_t *tca, uint8_t port, uint8_t value)
{
    if (port == TCA9535_PORT_0)
        tca->config_port_0 = value;
    else
        tca->config_port_1 = value;
    write_register(tca, REG_CONFIGURATION, port, value);
}

static void resolve_pin(uint8_t *pin, uint8_t *port, uint8_t *bit)
{
    if (*pin >= 8)
        *pin -= 2; // Port 2 starts at pin 10 on this board layout
    *port = *pin / 8;
    *bit = *pin % 8;
}

void tca9535_set_output_pin(tca9535_t *tca, uint8_t pin, uint8_t value, bool flush)
{
    uint8_t port, bit;
    resolve_pin(&pin, &port, &bit);

    if (port == TCA9535_PORT_0)
        tca->output_port_0 = (tca->output_port_0 & ~(1 << bit)) | (value << bit);
    else if (port == TCA9535_PORT_1)
        tca->output_port_1 = (tca->output_port_1 & ~(1 << bit)) | (value << bit);
    else {
        ESP_LOGE(TAG, "Invalid port %d", port);
        return;
    }

    if (flush) {
        write_register(tca, REG_OUTPUT, TCA9535_PORT_0, tca->output_port_0);
        write_register(tca, REG_OUTPUT, TCA9535_PORT_1, tca->output_port_1);
    }
}

void tca9535_set_pin_direction(tca9535_t *tca, uint8_t pin, bool is_input, bool flush)
{
    uint8_t port, bit;
    resolve_pin(&pin, &port, &bit);
    uint8_t val = is_input ? 1 : 0;

    if (port == TCA9535_PORT_0)
        tca->config_port_0 = (tca->config_port_0 & ~(1 << bit)) | (val << bit);
    else if (port == TCA9535_PORT_1)
        tca->config_port_1 = (tca->config_port_1 & ~(1 << bit)) | (val << bit);
    else {
        ESP_LOGE(TAG, "Invalid port %d", port);
        return;
    }

    if (flush) {
        write_register(tca, REG_CONFIGURATION, TCA9535_PORT_0, tca->config_port_0);
        write_register(tca, REG_CONFIGURATION, TCA9535_PORT_1, tca->config_port_1);
    }
}
