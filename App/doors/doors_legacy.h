#pragma once

#include "bsp_doors_io.h"

/* Оставляем твой стиль:
 * DoorX_Open  -> зелёный + замок OFF
 * DoorX_Close -> красный + замок ON
 */

#define Door1_Open()   do { BSP_DoorIO_ApplyLockIndicator(1, false); } while(0)
#define Door1_Close()  do { BSP_DoorIO_ApplyLockIndicator(1, true ); } while(0)

#define Door2_Open()   do { BSP_DoorIO_ApplyLockIndicator(2, false); } while(0)
#define Door2_Close()  do { BSP_DoorIO_ApplyLockIndicator(2, true ); } while(0)

#define Door3_Open()   do { BSP_DoorIO_ApplyLockIndicator(3, false); } while(0)
#define Door3_Close()  do { BSP_DoorIO_ApplyLockIndicator(3, true ); } while(0)

#define Door4_Open()   do { BSP_DoorIO_ApplyLockIndicator(4, false); } while(0)
#define Door4_Close()  do { BSP_DoorIO_ApplyLockIndicator(4, true ); } while(0)

#define Door5_Open()   do { BSP_DoorIO_ApplyLockIndicator(5, false); } while(0)
#define Door5_Close()  do { BSP_DoorIO_ApplyLockIndicator(5, true ); } while(0)

#define Door6_Open()   do { BSP_DoorIO_ApplyLockIndicator(6, false); } while(0)
#define Door6_Close()  do { BSP_DoorIO_ApplyLockIndicator(6, true ); } while(0)

#define Door7_Open()   do { BSP_DoorIO_ApplyLockIndicator(7, false); } while(0)
#define Door7_Close()  do { BSP_DoorIO_ApplyLockIndicator(7, true ); } while(0)

#define Door8_Open()   do { BSP_DoorIO_ApplyLockIndicator(8, false); } while(0)
#define Door8_Close()  do { BSP_DoorIO_ApplyLockIndicator(8, true ); } while(0)
