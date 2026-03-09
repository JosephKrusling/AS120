#pragma once

#include <stdint.h>

#define SYSTEM_PARAMETERS_LENGTH 314
#define METHOD_PARAMETERS_LENGTH 56

void store_system_parameters(const uint8_t *data);
void read_system_parameters(uint8_t *data);
void store_method_parameters(const uint8_t *data, uint8_t page_number);
void read_method_parameters(uint8_t *data, uint8_t page_number);
