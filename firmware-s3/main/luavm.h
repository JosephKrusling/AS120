#pragma once

#include "as120.h"
#include <lua.h>

typedef enum {
    PARSE_NORMAL = 0,
    PARSE_ESC_RECEIVED,
    PARSE_BRACKET_RECEIVED,
} parse_state_t;

typedef struct {
    as120_t *as120;
    char buffer[128];
    int64_t buffer_len;
    char last_command[128];
    int64_t last_command_len;
    size_t indentation_level;
    lua_State *L;
    parse_state_t parse_state;
} luavm_t;

size_t lua_handle_repl_input(luavm_t *vm, const char *input, size_t length);
