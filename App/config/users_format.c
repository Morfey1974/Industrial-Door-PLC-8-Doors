#include "users_format.h"
#include <string.h>

const char* Users_GetRoleName(user_role_t role)
{
    switch (role)
    {
        case USER_ROLE_SUPER_ADMIN:
            return "Супер-администратор";
        case USER_ROLE_ADMIN:
            return "Администратор";
        case USER_ROLE_OPERATOR:
            return "Оператор";
        default:
            return "Неизвестная роль";
    }
}
