/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * File Name          : Target/lwipopts.h
  * Description        : This file overrides LwIP stack default configuration
  *                      done in opt.h file.
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2026 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */

/* Define to prevent recursive inclusion --------------------------------------*/
#ifndef __LWIPOPTS__H__
#define __LWIPOPTS__H__

#include "main.h"

/*-----------------------------------------------------------------------------*/
/* Current version of LwIP supported by CubeMx: 2.1.2 -*/
/*-----------------------------------------------------------------------------*/

/* Within 'USER CODE' section, code will be kept by default at each generation */
/* USER CODE BEGIN 0 */

/* USER CODE END 0 */

#ifdef __cplusplus
 extern "C" {
#endif

/* STM32CubeMX Specific Parameters (not defined in opt.h) ---------------------*/
/* Parameters set in STM32CubeMX LwIP Configuration GUI -*/
/*----- WITH_RTOS enabled (Since FREERTOS is set) -----*/
#define WITH_RTOS 1
/* Temporary workaround to avoid conflict on errno defined in STM32CubeIDE and lwip sys_arch.c errno */
#undef LWIP_PROVIDE_ERRNO
/*----- CHECKSUM_BY_HARDWARE enabled -----*/
#define CHECKSUM_BY_HARDWARE 1
/*-----------------------------------------------------------------------------*/

/* LwIP Stack Parameters (modified compared to initialization value in opt.h) -*/
/* Parameters set in STM32CubeMX LwIP Configuration GUI -*/
/*----- Default value in ETH configuration GUI in CubeMx: 1524 -----*/
#define ETH_RX_BUFFER_SIZE 1536
/*----- Value in opt.h for MEM_ALIGNMENT: 1 -----*/
#define MEM_ALIGNMENT 4
/*----- Default Value for H7 devices: 0x30004000 -----*/
#define LWIP_RAM_HEAP_POINTER 0x30004000
/*----- Value supported for H7 devices: 1 -----*/
#define LWIP_SUPPORT_CUSTOM_PBUF 1
/*----- Value in opt.h for LWIP_ETHERNET: LWIP_ARP || PPPOE_SUPPORT -*/
#define LWIP_ETHERNET 1
/*----- Value in opt.h for LWIP_DNS_SECURE: (LWIP_DNS_SECURE_RAND_XID | LWIP_DNS_SECURE_NO_MULTIPLE_OUTSTANDING | LWIP_DNS_SECURE_RAND_SRC_PORT) -*/
#define LWIP_DNS_SECURE 7
/*----- Value in opt.h for TCP_SND_QUEUELEN: (4*TCP_SND_BUF + (TCP_MSS - 1))/TCP_MSS -----*/
#define TCP_SND_QUEUELEN 9
/*----- Value in opt.h for TCP_SNDLOWAT: LWIP_MIN(LWIP_MAX(((TCP_SND_BUF)/2), (2 * TCP_MSS) + 1), (TCP_SND_BUF) - 1) -*/
#define TCP_SNDLOWAT 1071
/*----- Value in opt.h for TCP_SNDQUEUELOWAT: LWIP_MAX(TCP_SND_QUEUELEN)/2, 5) -*/
#define TCP_SNDQUEUELOWAT 5
/*----- Value in opt.h for TCP_WND_UPDATE_THRESHOLD: LWIP_MIN(TCP_WND/4, TCP_MSS*4) -----*/
#define TCP_WND_UPDATE_THRESHOLD 536
/*----- Value in opt.h for LWIP_NETIF_LINK_CALLBACK: 0 -----*/
#define LWIP_NETIF_LINK_CALLBACK 1
/*----- Value in opt.h for TCPIP_THREAD_STACKSIZE: 0 -----*/
#define TCPIP_THREAD_STACKSIZE 1024
/*----- Value in opt.h for TCPIP_THREAD_PRIO: 1 -----*/
#define TCPIP_THREAD_PRIO 24
/*----- Value in opt.h for TCPIP_MBOX_SIZE: 0 -----*/
#define TCPIP_MBOX_SIZE 6
/*----- Value in opt.h for SLIPIF_THREAD_STACKSIZE: 0 -----*/
#define SLIPIF_THREAD_STACKSIZE 1024
/*----- Value in opt.h for SLIPIF_THREAD_PRIO: 1 -----*/
#define SLIPIF_THREAD_PRIO 3
/*----- Value in opt.h for DEFAULT_THREAD_STACKSIZE: 0 -----*/
#define DEFAULT_THREAD_STACKSIZE 1024
/*----- Value in opt.h for DEFAULT_THREAD_PRIO: 1 -----*/
#define DEFAULT_THREAD_PRIO 3
/*----- Value in opt.h for DEFAULT_UDP_RECVMBOX_SIZE: 0 -----*/
#define DEFAULT_UDP_RECVMBOX_SIZE 6
/*----- Value in opt.h for DEFAULT_TCP_RECVMBOX_SIZE: 0 -----*/
#define DEFAULT_TCP_RECVMBOX_SIZE 6
/*----- Value in opt.h for DEFAULT_ACCEPTMBOX_SIZE: 0 -----*/
#define DEFAULT_ACCEPTMBOX_SIZE 6
/*----- Value in opt.h for RECV_BUFSIZE_DEFAULT: INT_MAX -----*/
#define RECV_BUFSIZE_DEFAULT 2000000000
/*----- Value in opt.h for LWIP_STATS: 1 -----*/
#define LWIP_STATS 0
/*----- Value in opt.h for CHECKSUM_GEN_IP: 1 -----*/
#define CHECKSUM_GEN_IP 0
/*----- Value in opt.h for CHECKSUM_GEN_UDP: 1 -----*/
#define CHECKSUM_GEN_UDP 0
/*----- Value in opt.h for CHECKSUM_GEN_TCP: 1 -----*/
#define CHECKSUM_GEN_TCP 0
/*----- Value in opt.h for CHECKSUM_GEN_ICMP6: 1 -----*/
#define CHECKSUM_GEN_ICMP6 0
/*----- Value in opt.h for CHECKSUM_CHECK_IP: 1 -----*/
#define CHECKSUM_CHECK_IP 0
/*----- Value in opt.h for CHECKSUM_CHECK_UDP: 1 -----*/
#define CHECKSUM_CHECK_UDP 0
/*----- Value in opt.h for CHECKSUM_CHECK_TCP: 1 -----*/
#define CHECKSUM_CHECK_TCP 0
/*----- Value in opt.h for CHECKSUM_CHECK_ICMP6: 1 -----*/
#define CHECKSUM_CHECK_ICMP6 0
/*-----------------------------------------------------------------------------*/
/* USER CODE BEGIN 1 */

/* В lwIP макрос называется SO_REUSE (см. opt.h), не LWIP_SO_REUSE.
 * SO_REUSE==1: реально включает обработку setsockopt(SO_REUSEADDR) в sockets.c.
 * Без этого после link flap bind(:80) часто даёт errno=98 (EADDRINUSE).
 */
#ifndef SO_REUSE
#define SO_REUSE                        1
#endif

/* SO_REUSE_RXTOALL: см. комментарий в opt.h (multicast/broadcast fanout). */
#ifndef SO_REUSE_RXTOALL
#define SO_REUSE_RXTOALL                1
#endif

/* Link flap + tcpip_callback(netif): больше слотов и блоков сообщений, иначе ERR_MEM и
 * HttpTask не получает надёжный перезапуск listen — UI «молчит», пока CAN/двери живы. */
#undef TCPIP_MBOX_SIZE
#define TCPIP_MBOX_SIZE                 16
#define MEMP_NUM_TCPIP_MSG_API          16

/* По умолчанию в opt.h: MEMP_NUM_TCP_PCB=5, MEMP_NUM_TCP_SEG=16 — мало при link flap,
 * нескольких клиентах браузера и сокетах в TIME_WAIT → accept/bind падают, HTTP «умирает»
 * при живом ping. Пулы memp отдельны от MEM_SIZE (куча pbuf). */
#define MEMP_NUM_TCP_PCB                32
#define MEMP_NUM_TCP_PCB_LISTEN         8
#define MEMP_NUM_TCP_SEG                64

/* *** КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: TCP TIME_WAIT исчерпание ***
 *
 * Проблема: дефолтный TCP_MSL = 60000 мс → TIME_WAIT = 120 с.
 * При Connection: close и опросе UI ~1 запрос/сек, все 32 TCP PCB
 * уходят в TIME_WAIT за ~30 сек → сеть «умирает».
 *
 * TCP_MSL = 1000 мс → TIME_WAIT = 2 с — PCB освобождаются быстро.
 * Для embedded HTTP-сервера с короткими запросами это безопасно:
 * стандартные 2 минуты нужны для маршрутизации в интернете, не в LAN.
 */
#define TCP_MSL                         1000

/* MEM_SIZE: lwIP TX heap по адресу LWIP_RAM_HEAP_POINTER = 0x30004000.
 * RAM_D2 = 32 КБ (0x30000000–0x30007FFF). Доступно ≤ 16 КБ от 0x30004000.
 * С учётом overhead lwIP (выравнивание, bookkeeping) ставим 8 КБ — безопасно.
 * Дефолт 1600 — мало для JSON ответов 12 КБ (ERR_MEM). */
#define MEM_SIZE                        (8 * 1024)

/* TCP_SND_BUF: буфер отправки на одно соединение.
 * Дефолт 2*TCP_MSS=1072 — мелкие куски, медленная отдача.
 * 4 КБ позволяет отправить /api/state за меньшее число итераций. */
#define TCP_SND_BUF                     (4 * 1460)

/* TCP_WND: окно приёма. Больше окно → меньше задержек при приёме PUT. */
#define TCP_WND                         (4 * 1460)

/* MEMP_NUM_NETCONN: дефолт = 4. Каждый socket (listen + accept) съедает 1.
 * С 4-мя: 1 listen + 1 клиент + UDP = 3, запас = 1.
 * Если браузер открывает > 1 запроса, pool мгновенно полон. */
#define MEMP_NUM_NETCONN                16

/* LWIP_SO_LINGER: включить поддержку SO_LINGER в setsockopt.
 * Дефолт = 0 (выключен!). Без этого setsockopt(SO_LINGER) тихо игнорируется,
 * и http_server.c не может сделать RST при close → TIME_WAIT остаётся. */
#define LWIP_SO_LINGER                  1

/* Переопределяем TCP_SND_QUEUELEN / TCP_SNDLOWAT / TCP_WND_UPDATE_THRESHOLD:
 * CubeMX сгенерировал их для дефолтного TCP_SND_BUF=1072 и TCP_WND=2144.
 * После увеличения TCP_SND_BUF и TCP_WND оригинальные значения неконсистентны.
 * Формулы из opt.h: */
#undef TCP_SND_QUEUELEN
#define TCP_SND_QUEUELEN                ((4 * TCP_SND_BUF + (TCP_MSS - 1)) / TCP_MSS)

#undef TCP_SNDLOWAT
#define TCP_SNDLOWAT                    (TCP_SND_BUF / 2)

#undef TCP_SNDQUEUELOWAT
#define TCP_SNDQUEUELOWAT               (TCP_SND_QUEUELEN / 2)

#undef TCP_WND_UPDATE_THRESHOLD
#define TCP_WND_UPDATE_THRESHOLD        (TCP_WND / 4)

/* USER CODE END 1 */

#ifdef __cplusplus
}
#endif
#endif /*__LWIPOPTS__H__ */
