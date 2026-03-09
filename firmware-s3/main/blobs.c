#include "blobs.h"
#include "constants.h"
#include <nvs.h>
#include <esp_log.h>

#define TAG "blobs"

void store_system_parameters(const uint8_t *data)
{
    nvs_handle_t handle;
    if (nvs_open(SYSTEM_PARAMETERS_NAMESPACE, NVS_READWRITE, &handle) != ESP_OK) return;
    if (nvs_set_blob(handle, "sysp", data, SYSTEM_PARAMETERS_LENGTH) != ESP_OK) goto out;
    nvs_commit(handle);
out:
    nvs_close(handle);
}

void read_system_parameters(uint8_t *data)
{
    nvs_handle_t handle;
    if (nvs_open(SYSTEM_PARAMETERS_NAMESPACE, NVS_READWRITE, &handle) != ESP_OK) return;
    size_t size = SYSTEM_PARAMETERS_LENGTH;
    nvs_get_blob(handle, "sysp", data, &size);
    nvs_close(handle);
}

void store_method_parameters(const uint8_t *data, uint8_t page_number)
{
    nvs_handle_t handle;
    if (nvs_open(METHOD_PARAMETERS_NAMESPACE, NVS_READWRITE, &handle) != ESP_OK) return;
    char key[5] = { 'm', 't', 'h', '0' + page_number, '\0' };
    if (nvs_set_blob(handle, key, data, METHOD_PARAMETERS_LENGTH) != ESP_OK) goto out;
    nvs_commit(handle);
out:
    nvs_close(handle);
}

void read_method_parameters(uint8_t *data, uint8_t page_number)
{
    nvs_handle_t handle;
    if (nvs_open(METHOD_PARAMETERS_NAMESPACE, NVS_READWRITE, &handle) != ESP_OK) return;
    char key[5] = { 'm', 't', 'h', '0' + page_number, '\0' };
    size_t size = METHOD_PARAMETERS_LENGTH;
    nvs_get_blob(handle, key, data, &size);
    nvs_close(handle);
}
