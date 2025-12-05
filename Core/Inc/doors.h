/*
 * logica.h
 *
 *  Created on: Apr 18, 2025
 *      Author: morfe
 */

#ifndef INC_DOORS_H_
#define INC_DOORS_H_

#include "main.h"

#define DOOR_COUNT 8   // сейчас 8 дверей

//Определяем пременные двери №1
//Output

#define LookDoor1_ON		HAL_GPIO_WritePin(CPULookDoor1_GPIO_Port , CPULookDoor1_Pin, GPIO_PIN_RESET)
#define LookDoor1_OFF		HAL_GPIO_WritePin(CPULookDoor1_GPIO_Port , CPULookDoor1_Pin, GPIO_PIN_SET)
#define	LedGreenDoor1_ON 	HAL_GPIO_WritePin(CPULedGreenDoor1_GPIO_Port , CPULedGreenDoor1_Pin, GPIO_PIN_RESET)
#define	LedGreenDoor1_OFF 	HAL_GPIO_WritePin(CPULedGreenDoor1_GPIO_Port , CPULedGreenDoor1_Pin, GPIO_PIN_SET)
#define	LedRedDoor1_ON 		HAL_GPIO_WritePin(CPULedRedDoor1_GPIO_Port , CPULedRedDoor1_Pin, GPIO_PIN_RESET)
#define	LedRedDoor1_OFF 	HAL_GPIO_WritePin(CPULedRedDoor1_GPIO_Port , CPULedRedDoor1_Pin, GPIO_PIN_SET)
#define BuzzerDoor1_ON		HAL_GPIO_WritePin(CPUBuzzerDoor1_GPIO_Port, CPUBuzzerDoor1_Pin, GPIO_PIN_RESET)
#define BuzzerDoor1_OFF		HAL_GPIO_WritePin(CPUBuzzerDoor1_GPIO_Port, CPUBuzzerDoor1_Pin, GPIO_PIN_SET)




//INPUT
#define KeySensorDoor1		HAL_GPIO_ReadPin(CPUKeySensorDoor1_GPIO_Port, CPUKeySensorDoor1_Pin)
#define KeyAlarmDoor1		HAL_GPIO_ReadPin(CPUKeyAlarmDoor1_GPIO_Port, CPUKeyAlarmDoor1_Pin)

//Определяем пременные двери №2
//Output

#define LookDoor2_ON		HAL_GPIO_WritePin(CPULookDoor2_GPIO_Port , CPULookDoor2_Pin, GPIO_PIN_RESET)
#define LookDoor2_OFF		HAL_GPIO_WritePin(CPULookDoor2_GPIO_Port , CPULookDoor2_Pin, GPIO_PIN_SET)
#define	LedGreenDoor2_ON 	HAL_GPIO_WritePin(CPULedGreenDoor2_GPIO_Port , CPULedGreenDoor2_Pin, GPIO_PIN_RESET)
#define	LedGreenDoor2_OFF 	HAL_GPIO_WritePin(CPULedGreenDoor2_GPIO_Port , CPULedGreenDoor2_Pin, GPIO_PIN_SET)
#define	LedRedDoor2_ON 		HAL_GPIO_WritePin(CPULedRedDoor2_GPIO_Port , CPULedRedDoor2_Pin, GPIO_PIN_RESET)
#define	LedRedDoor2_OFF 	HAL_GPIO_WritePin(CPULedRedDoor2_GPIO_Port , CPULedRedDoor2_Pin, GPIO_PIN_SET)
#define BuzzerDoor2_ON		HAL_GPIO_WritePin(CPUBuzzerDoor2_GPIO_Port, CPUBuzzerDoor2_Pin, GPIO_PIN_RESET)
#define BuzzerDoor2_OFF		HAL_GPIO_WritePin(CPUBuzzerDoor2_GPIO_Port, CPUBuzzerDoor2_Pin, GPIO_PIN_SET)

//INPUT
#define KeySensorDoor2		HAL_GPIO_ReadPin(CPUKeySensorDoor2_GPIO_Port, CPUKeySensorDoor2_Pin)
#define KeyAlarmDoor2		HAL_GPIO_ReadPin(CPUKeyAlarmDoor2_GPIO_Port, CPUKeyAlarmDoor2_Pin)

//Определяем пременные двери №3
//Output

#define LookDoor3_ON		HAL_GPIO_WritePin(CPULookDoor3_GPIO_Port , CPULookDoor3_Pin, GPIO_PIN_RESET)
#define LookDoor3_OFF		HAL_GPIO_WritePin(CPULookDoor3_GPIO_Port , CPULookDoor3_Pin, GPIO_PIN_SET)
#define	LedGreenDoor3_ON 	HAL_GPIO_WritePin(CPULedGreenDoor3_GPIO_Port , CPULedGreenDoor3_Pin, GPIO_PIN_RESET)
#define	LedGreenDoor3_OFF 	HAL_GPIO_WritePin(CPULedGreenDoor3_GPIO_Port , CPULedGreenDoor3_Pin, GPIO_PIN_SET)
#define	LedRedDoor3_ON 		HAL_GPIO_WritePin(CPULedRedDoor3_GPIO_Port , CPULedRedDoor3_Pin, GPIO_PIN_RESET)
#define	LedRedDoor3_OFF 	HAL_GPIO_WritePin(CPULedRedDoor3_GPIO_Port , CPULedRedDoor3_Pin, GPIO_PIN_SET)
#define BuzzerDoor3_ON		HAL_GPIO_WritePin(CPUBuzzerDoor3_GPIO_Port, CPUBuzzerDoor3_Pin, GPIO_PIN_RESET)
#define BuzzerDoor3_OFF		HAL_GPIO_WritePin(CPUBuzzerDoor3_GPIO_Port, CPUBuzzerDoor3_Pin, GPIO_PIN_SET)

//INPUT
#define KeySensorDoor3		HAL_GPIO_ReadPin(CPUKeySensorDoor3_GPIO_Port, CPUKeySensorDoor3_Pin)
#define KeyAlarmDoor3		HAL_GPIO_ReadPin(CPUKeyAlarmDoor3_GPIO_Port, CPUKeyAlarmDoor3_Pin)

//Определяем пременные двери №4
//Output

#define LookDoor4_ON		HAL_GPIO_WritePin(CPULookDoor4_GPIO_Port , CPULookDoor4_Pin, GPIO_PIN_RESET)
#define LookDoor4_OFF		HAL_GPIO_WritePin(CPULookDoor4_GPIO_Port , CPULookDoor4_Pin, GPIO_PIN_SET)
#define	LedGreenDoor4_ON 	HAL_GPIO_WritePin(CPULedGreenDoor4_GPIO_Port , CPULedGreenDoor4_Pin, GPIO_PIN_RESET)
#define	LedGreenDoor4_OFF 	HAL_GPIO_WritePin(CPULedGreenDoor4_GPIO_Port , CPULedGreenDoor4_Pin, GPIO_PIN_SET)
#define	LedRedDoor4_ON 		HAL_GPIO_WritePin(CPULedRedDoor4_GPIO_Port , CPULedRedDoor4_Pin, GPIO_PIN_RESET)
#define	LedRedDoor4_OFF 	HAL_GPIO_WritePin(CPULedRedDoor4_GPIO_Port , CPULedRedDoor4_Pin, GPIO_PIN_SET)
#define BuzzerDoor4_ON		HAL_GPIO_WritePin(CPUBuzzerDoor4_GPIO_Port, CPUBuzzerDoor4_Pin, GPIO_PIN_RESET)
#define BuzzerDoor4_OFF		HAL_GPIO_WritePin(CPUBuzzerDoor4_GPIO_Port, CPUBuzzerDoor4_Pin, GPIO_PIN_SET)

//INPUT
#define KeySensorDoor4		HAL_GPIO_ReadPin(CPUKeySensorDoor4_GPIO_Port, CPUKeySensorDoor4_Pin)
#define KeyAlarmDoor4		HAL_GPIO_ReadPin(CPUKeyAlarmDoor4_GPIO_Port, CPUKeyAlarmDoor4_Pin)

//Определяем пременные двери №5
//Output

#define LookDoor5_ON		HAL_GPIO_WritePin(CPULookDoor5_GPIO_Port , CPULookDoor5_Pin, GPIO_PIN_RESET)
#define LookDoor5_OFF		HAL_GPIO_WritePin(CPULookDoor5_GPIO_Port , CPULookDoor5_Pin, GPIO_PIN_SET)
#define	LedGreenDoor5_ON 	HAL_GPIO_WritePin(CPULedGreenDoor5_GPIO_Port , CPULedGreenDoor5_Pin, GPIO_PIN_RESET)
#define	LedGreenDoor5_OFF 	HAL_GPIO_WritePin(CPULedGreenDoor5_GPIO_Port , CPULedGreenDoor5_Pin, GPIO_PIN_SET)
#define	LedRedDoor5_ON 		HAL_GPIO_WritePin(CPULedRedDoor5_GPIO_Port , CPULedRedDoor5_Pin, GPIO_PIN_RESET)
#define	LedRedDoor5_OFF 	HAL_GPIO_WritePin(CPULedRedDoor5_GPIO_Port , CPULedRedDoor5_Pin, GPIO_PIN_SET)
#define BuzzerDoor5_ON		HAL_GPIO_WritePin(CPUBuzzerDoor5_GPIO_Port, CPUBuzzerDoor5_Pin, GPIO_PIN_RESET)
#define BuzzerDoor5_OFF		HAL_GPIO_WritePin(CPUBuzzerDoor5_GPIO_Port, CPUBuzzerDoor5_Pin, GPIO_PIN_SET)

//INPUT
#define KeySensorDoor5		HAL_GPIO_ReadPin(CPUKeySensorDoor5_GPIO_Port, CPUKeySensorDoor5_Pin)
#define KeyAlarmDoor5		HAL_GPIO_ReadPin(CPUKeyAlarmDoor5_GPIO_Port, CPUKeyAlarmDoor5_Pin)

//Определяем пременные двери №6
//Output

#define LookDoor6_ON		HAL_GPIO_WritePin(CPULookDoor6_GPIO_Port , CPULookDoor6_Pin, GPIO_PIN_RESET)
#define LookDoor6_OFF		HAL_GPIO_WritePin(CPULookDoor6_GPIO_Port , CPULookDoor6_Pin, GPIO_PIN_SET)
#define	LedGreenDoor6_ON 	HAL_GPIO_WritePin(CPULedGreenDoor6_GPIO_Port , CPULedGreenDoor6_Pin, GPIO_PIN_RESET)
#define	LedGreenDoor6_OFF 	HAL_GPIO_WritePin(CPULedGreenDoor6_GPIO_Port , CPULedGreenDoor6_Pin, GPIO_PIN_SET)
#define	LedRedDoor6_ON 		HAL_GPIO_WritePin(CPULedRedDoor6_GPIO_Port , CPULedRedDoor6_Pin, GPIO_PIN_RESET)
#define	LedRedDoor6_OFF 	HAL_GPIO_WritePin(CPULedRedDoor6_GPIO_Port , CPULedRedDoor6_Pin, GPIO_PIN_SET)
#define BuzzerDoor6_ON		HAL_GPIO_WritePin(CPUBuzzerDoor6_GPIO_Port, CPUBuzzerDoor6_Pin, GPIO_PIN_RESET)
#define BuzzerDoor6_OFF		HAL_GPIO_WritePin(CPUBuzzerDoor6_GPIO_Port, CPUBuzzerDoor6_Pin, GPIO_PIN_SET)

//INPUT
#define KeySensorDoor6		HAL_GPIO_ReadPin(CPUKeySensorDoor6_GPIO_Port, CPUKeySensorDoor6_Pin)
#define KeyAlarmDoor6		HAL_GPIO_ReadPin(CPUKeyAlarmDoor6_GPIO_Port, CPUKeyAlarmDoor6_Pin)

//Определяем пременные двери №7
//Output

#define LookDoor7_ON		HAL_GPIO_WritePin(CPULookDoor7_GPIO_Port , CPULookDoor7_Pin, GPIO_PIN_RESET)
#define LookDoor7_OFF		HAL_GPIO_WritePin(CPULookDoor7_GPIO_Port , CPULookDoor7_Pin, GPIO_PIN_SET)
#define	LedGreenDoor7_ON 	HAL_GPIO_WritePin(CPULedGreenDoor7_GPIO_Port , CPULedGreenDoor7_Pin, GPIO_PIN_RESET)
#define	LedGreenDoor7_OFF 	HAL_GPIO_WritePin(CPULedGreenDoor7_GPIO_Port , CPULedGreenDoor7_Pin, GPIO_PIN_SET)
#define	LedRedDoor7_ON 		HAL_GPIO_WritePin(CPULedRedDoor7_GPIO_Port , CPULedRedDoor7_Pin, GPIO_PIN_RESET)
#define	LedRedDoor7_OFF 	HAL_GPIO_WritePin(CPULedRedDoor7_GPIO_Port , CPULedRedDoor7_Pin, GPIO_PIN_SET)
#define BuzzerDoor7_ON		HAL_GPIO_WritePin(CPUBuzzerDoor7_GPIO_Port, CPUBuzzerDoor7_Pin, GPIO_PIN_RESET)
#define BuzzerDoor7_OFF		HAL_GPIO_WritePin(CPUBuzzerDoor7_GPIO_Port, CPUBuzzerDoor7_Pin, GPIO_PIN_SET)

//INPUT
#define KeySensorDoor7		HAL_GPIO_ReadPin(CPUKeySensorDoor7_GPIO_Port, CPUKeySensorDoor7_Pin)
#define KeyAlarmDoor7		HAL_GPIO_ReadPin(CPUKeyAlarmDoor7_GPIO_Port, CPUKeyAlarmDoor7_Pin)

//Определяем пременные двери №8
//Output

#define LookDoor8_ON		HAL_GPIO_WritePin(CPULookDoor8_GPIO_Port , CPULookDoor8_Pin, GPIO_PIN_RESET)
#define LookDoor8_OFF		HAL_GPIO_WritePin(CPULookDoor8_GPIO_Port , CPULookDoor8_Pin, GPIO_PIN_SET)
#define	LedGreenDoor8_ON 	HAL_GPIO_WritePin(CPULedGreenDoor8_GPIO_Port , CPULedGreenDoor8_Pin, GPIO_PIN_RESET)
#define	LedGreenDoor8_OFF 	HAL_GPIO_WritePin(CPULedGreenDoor8_GPIO_Port , CPULedGreenDoor8_Pin, GPIO_PIN_SET)
#define	LedRedDoor8_ON 		HAL_GPIO_WritePin(CPULedRedDoor8_GPIO_Port , CPULedRedDoor8_Pin, GPIO_PIN_RESET)
#define	LedRedDoor8_OFF 	HAL_GPIO_WritePin(CPULedRedDoor8_GPIO_Port , CPULedRedDoor8_Pin, GPIO_PIN_SET)
#define BuzzerDoor8_ON		HAL_GPIO_WritePin(CPUBuzzerDoor8_GPIO_Port, CPUBuzzerDoor8_Pin, GPIO_PIN_RESET)
#define BuzzerDoor8_OFF		HAL_GPIO_WritePin(CPUBuzzerDoor8_GPIO_Port, CPUBuzzerDoor8_Pin, GPIO_PIN_SET)

//INPUT
#define KeySensorDoor8		HAL_GPIO_ReadPin(CPUKeySensorDoor8_GPIO_Port, CPUKeySensorDoor8_Pin)
#define KeyAlarmDoor8		HAL_GPIO_ReadPin(CPUKeyAlarmDoor8_GPIO_Port, CPUKeyAlarmDoor8_Pin)


/* ========= Структуры состояния и конфигурации дверей ========= */

typedef struct {
    uint8_t physClosed;      // 1 = дверь закрыта по датчику
    uint8_t alarmPressed;    // 1 = кнопка тревоги нажата
    uint8_t lockOpen;        // 1 = LookDoor ON
    uint8_t ledRed;
    uint8_t ledGreen;
    uint8_t buzzer;
    uint32_t lastChangeMs;   // время последнего изменения
} DoorState_t;

typedef struct {
    uint8_t mode;          // логический режим двери
    uint8_t allowOpen;     // разрешать ли открытие
    uint8_t autoClose;     // автозакрытие
    uint16_t autoCloseMs;  // таймер автозакрытия
    uint8_t alarmEnabled;  // использовать ли тревожную кнопку
} DoorConfig_t;


/* Прототип задачи дверей для FreeRTOS */
void StartDoorsTask(void *argument);


/* ---------------- Логические состояния дверей ---------------- */

/* Дверь 1 */
#define Door1_Open()   do { \
    LedRedDoor1_OFF;    \
    LedGreenDoor1_ON;   \
    LookDoor1_OFF;      \
} while(0)

#define Door1_Close()  do { \
    LedRedDoor1_ON;     \
    LedGreenDoor1_OFF;  \
    LookDoor1_ON;       \
} while(0)

/* Дверь 2 */
#define Door2_Open()   do { \
    LedRedDoor2_OFF;    \
    LedGreenDoor2_ON;   \
    LookDoor2_OFF;      \
} while(0)

#define Door2_Close()  do { \
    LedRedDoor2_ON;     \
    LedGreenDoor2_OFF;  \
    LookDoor2_ON;       \
} while(0)

/* Дверь 3 */
#define Door3_Open()   do { \
    LedRedDoor3_OFF;    \
    LedGreenDoor3_ON;   \
    LookDoor3_OFF;      \
} while(0)

#define Door3_Close()  do { \
    LedRedDoor3_ON;     \
    LedGreenDoor3_OFF;  \
    LookDoor3_ON;       \
} while(0)

/* Дверь 4 */
#define Door4_Open()   do { \
    LedRedDoor4_OFF;    \
    LedGreenDoor4_ON;   \
    LookDoor4_OFF;      \
} while(0)

#define Door4_Close()  do { \
    LedRedDoor4_ON;     \
    LedGreenDoor4_OFF;  \
    LookDoor4_ON;       \
} while(0)

/* Дверь 5 */
#define Door5_Open()   do { \
    LedRedDoor5_OFF;    \
    LedGreenDoor5_ON;   \
    LookDoor5_OFF;      \
} while(0)

#define Door5_Close()  do { \
    LedRedDoor5_ON;     \
    LedGreenDoor5_OFF;  \
    LookDoor5_ON;       \
} while(0)

/* Дверь 6 */
#define Door6_Open()   do { \
    LedRedDoor6_OFF;    \
    LedGreenDoor6_ON;   \
    LookDoor6_OFF;      \
} while(0)

#define Door6_Close()  do { \
    LedRedDoor6_ON;     \
    LedGreenDoor6_OFF;  \
    LookDoor6_ON;       \
} while(0)

/* Дверь 7 */
#define Door7_Open()   do { \
    LedRedDoor7_OFF;    \
    LedGreenDoor7_ON;   \
    LookDoor7_OFF;      \
} while(0)

#define Door7_Close()  do { \
    LedRedDoor7_ON;     \
    LedGreenDoor7_OFF;  \
    LookDoor7_ON;       \
} while(0)

/* Дверь 8 */
#define Door8_Open()   do { \
    LedRedDoor8_OFF;    \
    LedGreenDoor8_ON;   \
    LookDoor8_OFF;      \
} while(0)

#define Door8_Close()  do { \
    LedRedDoor8_ON;     \
    LedGreenDoor8_OFF;  \
    LookDoor8_ON;       \
} while(0)


#endif /* INC_DOORS_H_ */
