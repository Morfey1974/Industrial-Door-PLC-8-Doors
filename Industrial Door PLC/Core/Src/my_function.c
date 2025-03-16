#include "main.h"

//мои функции
//=============================================================================================================
void Close_Door1() {

	HAL_GPIO_WritePin(Output_Relay1_GPIO_Port, Output_Relay1_Pin, GPIO_PIN_RESET);
	HAL_GPIO_WritePin(Led_Red3_GPIO_Port, Led_Red3_Pin, GPIO_PIN_SET);
	HAL_GPIO_WritePin(LED_GREEN_LD1_GPIO_Port, LED_GREEN_LD1_Pin, GPIO_PIN_RESET);

}

void Close_Door2() {

	HAL_GPIO_WritePin(Output_Relay2_GPIO_Port, Output_Relay2_Pin,GPIO_PIN_RESET);
	HAL_GPIO_WritePin(Led_Red3_GPIO_Port, Led_Red3_Pin, GPIO_PIN_SET);
	HAL_GPIO_WritePin(LED_GREEN_LD1_GPIO_Port, LED_GREEN_LD1_Pin, GPIO_PIN_RESET);

}

void Open_Door1() {

	HAL_GPIO_WritePin(Output_Relay1_GPIO_Port, Output_Relay1_Pin, GPIO_PIN_SET);
	HAL_GPIO_WritePin(Led_Red3_GPIO_Port, Led_Red3_Pin, GPIO_PIN_RESET);
	HAL_GPIO_WritePin(LED_GREEN_LD1_GPIO_Port, LED_GREEN_LD1_Pin, GPIO_PIN_SET);

}

void Open_Door2() {

	HAL_GPIO_WritePin(Output_Relay2_GPIO_Port, Output_Relay2_Pin,GPIO_PIN_SET);
	HAL_GPIO_WritePin(Led_Red3_GPIO_Port, Led_Red3_Pin, GPIO_PIN_RESET);
	HAL_GPIO_WritePin(LED_GREEN_LD1_GPIO_Port, LED_GREEN_LD1_Pin, GPIO_PIN_SET);

}
void LED_Yllow(){
	HAL_GPIO_WritePin(LED_Yellow_LD2_GPIO_Port, LED_Yellow_LD2_Pin, GPIO_PIN_SET);

}


//мои функции
//=============================================================================================================
