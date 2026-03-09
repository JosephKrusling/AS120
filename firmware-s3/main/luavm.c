#include "luavm.h"
#include "as120.h"
#include "constants.h"

#include "lua.h"
#include "lauxlib.h"
#include "lualib.h"
#include "esp_log.h"

#include <string.h>

#define TAG "luavm"

static const char *HELP_TEXT =
    "\nLua REPL Help\n"
    "Learn about Lua at https://www.lua.org/manual/5.4/\n"
    "\nGeneral Commands:\n"
    "  help()              - Show this help message\n"
    "  exit()              - Exit Lua REPL, return to 4-byte mode\n"
    "  home()              - Home all axes\n"
    "  wait(ms)            - Wait for a number of milliseconds\n"
    "  print(...)          - Print to UART0 (this REPL)\n"
    "  log(...)            - Print to UART1 (RS-232 debug)\n"
    "\nMotor Commands:\n"
    "  move(motor, pos)    - Move motor to absolute position\n"
    "  jog(motor, steps)   - Move motor relative to current position\n"
    "  set_motor_prop(motor, prop, value)\n"
    "  get_motor_props(motor)\n"
    "\n  motor: 0-3 or 'fb', 'ud', 'pl', 'lr'\n"
    "  props: 'acc', 'maxspeed', 'minspeed', 'homespeed', 'stepsize'\n";

static const char *PREAMBLE =
    "print('Initializing Lua REPL...')\n";

// Helper: resolve motor index from Lua arg (integer or string name)
static int resolve_motor_index(lua_State *L, int arg_idx)
{
    if (lua_isinteger(L, arg_idx)) {
        int idx = lua_tointeger(L, arg_idx);
        if (idx < 0 || idx >= MOTOR_COUNT) {
            luaL_error(L, "Motor index must be 0-%d", MOTOR_COUNT - 1);
        }
        return idx;
    }
    if (lua_isstring(L, arg_idx)) {
        const char *name = lua_tostring(L, arg_idx);
        if (strcmp(name, "fb") == 0) return MOTOR_FORWARD_BACK;
        if (strcmp(name, "ud") == 0) return MOTOR_UP_DOWN;
        if (strcmp(name, "pl") == 0) return MOTOR_PLUNGER;
        if (strcmp(name, "lr") == 0) return MOTOR_RIGHT_LEFT;
        luaL_error(L, "Unknown motor name '%s'. Use 'fb', 'ud', 'pl', or 'lr'.", name);
    }
    luaL_error(L, "Motor must be an integer (0-%d) or name ('fb','ud','pl','lr')", MOTOR_COUNT - 1);
    return -1;
}

static int l_help(lua_State *L)
{
    uart_write_bytes(0, HELP_TEXT, strlen(HELP_TEXT));
    return 0;
}

static int l_exit(lua_State *L)
{
    as120_t *dev = lua_touserdata(L, lua_upvalueindex(1));
    dev->input_mode = INPUT_MODE_4BYTE;
    return 0;
}

static int l_wait(lua_State *L)
{
    int ms = luaL_checkinteger(L, 1);
    vTaskDelay(pdMS_TO_TICKS(ms));
    return 0;
}

static int l_home(lua_State *L)
{
    as120_t *dev = lua_touserdata(L, lua_upvalueindex(1));
    for (int i = 0; i < MOTOR_COUNT; i++) {
        action_t bump = { ACTION_INCREMENT, i, 0, 10, NULL };
        as120_enqueue_action(dev, bump);
        action_t home = { ACTION_ABSOLUTE, i, 0, 0, NULL };
        as120_enqueue_action(dev, home);
    }
    return 0;
}

static int l_move(lua_State *L)
{
    as120_t *dev = lua_touserdata(L, lua_upvalueindex(1));
    int motor_index = resolve_motor_index(L, 1);
    int position = luaL_checkinteger(L, 2);
    action_t a = { ACTION_ABSOLUTE, motor_index, 0, position, NULL };
    as120_enqueue_action(dev, a);
    return 0;
}

static int l_jog(lua_State *L)
{
    as120_t *dev = lua_touserdata(L, lua_upvalueindex(1));
    int motor_index = resolve_motor_index(L, 1);
    int steps = luaL_checkinteger(L, 2);
    action_t a = { ACTION_INCREMENT, motor_index, 0, steps, NULL };
    as120_enqueue_action(dev, a);
    return 0;
}

static int l_set_motor_prop(lua_State *L)
{
    as120_t *dev = lua_touserdata(L, lua_upvalueindex(1));
    int idx = resolve_motor_index(L, 1);
    const char *prop = luaL_checkstring(L, 2);
    int value = luaL_checkinteger(L, 3);
    stepper_t *s = &dev->motors[idx].stepper;

    if (strcmp(prop, "acc") == 0)            s->max_acceleration = value;
    else if (strcmp(prop, "maxspeed") == 0)   s->speed_max = value;
    else if (strcmp(prop, "minspeed") == 0)   s->speed_min = value;
    else if (strcmp(prop, "homespeed") == 0)  s->speed_homing = value;
    else if (strcmp(prop, "stepsize") == 0)   s->step_size = value;
    else luaL_error(L, "Unknown property '%s'", prop);

    return 0;
}

static int l_get_motor_props(lua_State *L)
{
    as120_t *dev = lua_touserdata(L, lua_upvalueindex(1));
    int idx = resolve_motor_index(L, 1);
    stepper_t *s = &dev->motors[idx].stepper;

    lua_newtable(L);

    lua_pushinteger(L, s->max_acceleration); lua_setfield(L, -2, "acc");
    lua_pushinteger(L, s->speed_max);        lua_setfield(L, -2, "maxspeed");
    lua_pushinteger(L, s->speed_min);        lua_setfield(L, -2, "minspeed");
    lua_pushinteger(L, s->speed_homing);     lua_setfield(L, -2, "homespeed");
    lua_pushinteger(L, s->step_size);        lua_setfield(L, -2, "stepsize");
    lua_pushinteger(L, s->position);         lua_setfield(L, -2, "position");

    return 1;
}

static void register_closure(lua_State *L, const char *name, lua_CFunction fn, void *upvalue)
{
    lua_pushlightuserdata(L, upvalue);
    lua_pushcclosure(L, fn, 1);
    lua_setglobal(L, name);
}

static void register_lua_functions(as120_t *dev, lua_State *L)
{
    lua_register(L, "help", l_help);
    lua_register(L, "wait", l_wait);
    register_closure(L, "home", l_home, dev);
    register_closure(L, "exit", l_exit, dev);
    register_closure(L, "move", l_move, dev);
    register_closure(L, "jog", l_jog, dev);
    register_closure(L, "set_motor_prop", l_set_motor_prop, dev);
    register_closure(L, "get_motor_props", l_get_motor_props, dev);
}

static void show_prompt(luavm_t *vm)
{
    if (vm->indentation_level == 0) {
        uart_write_bytes(0, "\nlua> ", 6);
    } else {
        uart_write_bytes(0, "\n", 1);
        for (size_t i = 0; i < vm->indentation_level + 3; i++)
            uart_write_bytes(0, ".", 1);
        uart_write_bytes(0, "  ", 2);
    }
}

static void clear_line(luavm_t *vm)
{
    for (int j = 0; j < vm->buffer_len; j++)
        uart_write_bytes(0, "\b \b", 3);
    vm->buffer_len = 0;
}

size_t lua_handle_repl_input(luavm_t *vm, const char *input, size_t length)
{
    if (vm->L == NULL) {
        vm->L = luaL_newstate();
        luaL_openlibs(vm->L);
        register_lua_functions(vm->as120, vm->L);
        if (luaL_dostring(vm->L, PREAMBLE) != LUA_OK) {
            ESP_LOGE(TAG, "Preamble error: %s", lua_tostring(vm->L, -1));
            lua_pop(vm->L, 1);
        }
    }

    for (size_t i = 0; i < length; i++) {
        char ch = input[i];

        // Backspace
        if (ch == 8 || ch == 127) {
            if (vm->buffer_len > 0) {
                vm->buffer_len--;
                uart_write_bytes(0, "\b \b", 3);
            }
            continue;
        }

        // Carriage return — ignore (we handle newline)
        if (ch == '\r') continue;

        // Newline — execute
        if (ch == '\n') {
            vm->buffer[vm->buffer_len] = '\0';

            // Save for up-arrow recall
            vm->last_command_len = vm->buffer_len;
            memcpy(vm->last_command, vm->buffer, vm->buffer_len);

            int status = luaL_loadstring(vm->L, vm->buffer);
            if (status != LUA_OK) {
                const char *err = lua_tostring(vm->L, -1);
                // Multiline: if Lua says "end expected near <eof>", continue on next line
                if (strstr(err, "'end' expected") && strstr(err, "near <eof>")) {
                    lua_pop(vm->L, 1);
                    vm->buffer[vm->buffer_len++] = '\n';
                    uart_write_bytes(0, "\n     ", 6);
                    continue;
                }
                uart_write_bytes(0, "\n", 1);
                uart_write_bytes(0, err, strlen(err));
                lua_pop(vm->L, 1);
            } else {
                int exec = lua_pcall(vm->L, 0, LUA_MULTRET, 0);
                if (exec != LUA_OK) {
                    const char *err = lua_tostring(vm->L, -1);
                    uart_write_bytes(0, "\n", 1);
                    uart_write_bytes(0, err, strlen(err));
                    lua_pop(vm->L, 1);
                }
            }
            vm->buffer_len = 0;
            show_prompt(vm);
            continue;
        }

        // ANSI escape sequence handling
        if (ch == 27) { // ESC
            if (vm->parse_state == PARSE_ESC_RECEIVED) {
                clear_line(vm);
                vm->parse_state = PARSE_NORMAL;
            } else {
                vm->parse_state = PARSE_ESC_RECEIVED;
            }
            continue;
        }
        if (ch == '[' && vm->parse_state == PARSE_ESC_RECEIVED) {
            vm->parse_state = PARSE_BRACKET_RECEIVED;
            continue;
        }
        if (vm->parse_state == PARSE_BRACKET_RECEIVED) {
            vm->parse_state = PARSE_NORMAL;
            if (ch == 'A') { // Up arrow — recall last command
                clear_line(vm);
                vm->buffer_len = vm->last_command_len;
                memcpy(vm->buffer, vm->last_command, vm->last_command_len);
                uart_write_bytes(0, vm->buffer, vm->buffer_len);
            } else if (ch == 'B') { // Down arrow — clear
                clear_line(vm);
            }
            // Ignore left/right arrows for now
            continue;
        }

        // Normal character
        uart_write_bytes(0, &ch, 1); // echo
        if (vm->buffer_len < (int64_t)sizeof(vm->buffer) - 1)
            vm->buffer[vm->buffer_len++] = ch;
    }

    return 0;
}
