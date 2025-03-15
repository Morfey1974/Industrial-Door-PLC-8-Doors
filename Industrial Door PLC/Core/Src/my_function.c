
#include "main.h"
#include "string.h"








//мои функции
//=============================================================================================================
void Green(){
	HAL_GPIO_WritePin(LED_Yellow_LD2_GPIO_Port, LED_Yellow_LD2_Pin, GPIO_PIN_RESET);
	HAL_GPIO_WritePin(Led_Red3_GPIO_Port, Led_Red3_Pin, GPIO_PIN_RESET);
	 HAL_GPIO_WritePin(LED_GREEN_LD1_GPIO_Port, LED_GREEN_LD1_Pin, GPIO_PIN_SET);

}

void Red(){
	HAL_GPIO_WritePin(LED_GREEN_LD1_GPIO_Port, LED_GREEN_LD1_Pin, GPIO_PIN_RESET);
	HAL_GPIO_WritePin(Led_Red3_GPIO_Port, Led_Red3_Pin, GPIO_PIN_SET);

}
void Yellow(){
	HAL_GPIO_WritePin(Led_Red3_GPIO_Port, Led_Red3_Pin, GPIO_PIN_RESET);
	HAL_GPIO_WritePin(LED_GREEN_LD1_GPIO_Port, LED_GREEN_LD1_Pin, GPIO_PIN_RESET);
	HAL_GPIO_WritePin(LED_Yellow_LD2_GPIO_Port, LED_Yellow_LD2_Pin, GPIO_PIN_SET);


}


//мои функции
//=============================================================================================================
