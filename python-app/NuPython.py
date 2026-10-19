 ##################################################################################
# Copyright  Information:This software is the property of Xtramus and shall 
#                         not be reproduced distributed and copied without
#                         the permission from Xtramus.
# Module Name           : NuPython.py
# Interface Spec        :
# Description           : This file contains the NuStreamsÂ© dependent function. 
# Author Name           : Taken Shih
# Revision              : v0.1b004
# Describe known bugs   : v0.1b001 - SetRxStramConfig combine with StartTx make the rx port receive error stream data
#                         v0.1b003 - 
#                         v0.1b004 - rename all functions/variables name. New media setting function.
#                         v0.1b005 - log close move inside disconnect. create lots of py files. new function for capture
#                         v0.1b006 - avoid "index out of range" error. analyze capture file through tshark application.
#                         v0.9b001 - force convert the result of integer division to int() in python3, because the result is not integer(is float).
#                         v0.9b002 - autoarp / ping / dhcp
#                         v0.9b004 - vlan tag int
#                         v0.9b005 - MU framework
#                         v0.9b006 - adderror for stream setting
#                         v0.9b009 - for NuStream-900 slot1, chassis power setting
#                         v0.9b016 - Fix error of tx counter by time at media speed 5G/2.5G.
#                         v0.9b017 - Append modified payload to PortConfig command.
#                         v0.9b018 - modify the type of counter_per_sec/total_pkts to array list for port index
#                         v0.9b019 - new func: manual tx rate
######################################################################################
#!/usr/bin/python
# -*- encoding: utf-8 -*-
import socket
import struct
import sys
import nucommand
import nuconst
import nupktstorage

ns_const = nuconst.NuStreamsConst()
ns_pktdb = nupktstorage.NuStreamsPacketStorage()
python_ver = 2
if sys.version_info < (3, 0):
    import thread
    python_ver = 2
else:
    import _thread
    python_ver = 3
import time
import random
import array
import math # for pow operator
# 20170912, TK, added
import t451counter 

# 20160803 - 
#  * [new] txconfig and start tx command
#  * [verify] the corrective of parser counter report after StartTx
#  * [new] all message output to log

class NuStreamsLicense:
    def __init__(self):
        self.license_mode = "Normal    "
        self.license_date = "2017/12/31"
        self.license_times = "0"

class NuStreamsCounterRxStream:
    def __init__(self):
        self.count_pkts = 0
        self.count_bytes = 0
        self.latency = 0.0

class NuStreamsCounterTxStream:
    def __init__(self):
        self.count_pkts = 0
        self.count_bytes = 0

class NuStreamsCounterPort:
    def __init__(self):
        self.rx_broadcast = 0
        self.rx_multicast = 0
        self.rx_unicast = 0
        self.rx_pause = 0
        self.rx_vlan = 0
        self.rx_ipv4 = 0
        self.rx_err_dribble = 0
        self.rx_err_align = 0
        self.rx_err_crc = 0
        self.rx_undersize = 0
        self.rx_oversize = 0
        self.rx_goodpkts = 0
        self.rx_err_di = 0
        self.rx_err_ipchksum = 0
        self.rx_64 = 0
        self.rx_65_127 = 0
        self.rx_128_255 = 0
        self.rx_256_511 = 0
        self.rx_512_1023 = 0
        self.rx_1024_1522 = 0
        self.rx_capture = 0
        self.rx_host_quefull = 0
        self.rx_icmp = 0
        self.rx_arp = 0
        self.rx_err_fragment = 0
        self.rx_err_tcpchksum = 0
        self.rx_err_udpchksum = 0
        self.rx_ipv4_fragment = 0
        self.rx_ipv4_extension = 0
        self.rx_xtag = 0
        self.rx_gap_over12 = 0
        self.rx_arp_reply = 0
        self.rx_arp_request = 0
        self.rx_icmp_reply = 0
        self.rx_icmp_request = 0
        self.rx_icmpv6_reply = 0
        self.rx_icmpv6_request = 0
        self.rx_rx_nb_solicit = 0
        self.rx_nb_advert = 0
        self.rx_router_advert = 0
        self.rx_byte = 0
        self.rx_rate_byte = 0
        self.rx_rate_pkt = 0
        self.rx_host_lldp = 0
        self.rx_host_8021d = 0
        self.rx_err_bert = 0
        self.rx_sdfr_da = 0
        self.rx_sdfr_sa = 0
        self.rx_sdfr_vid = 0
        self.rx_sdfr_vid_qinq = 0
        self.rx_sdfr_mpls = 0
        self.rx_sdfr_sip = 0
        self.rx_sdfr_dip = 0
        self.rx_sdfr_sp = 0
        self.rx_sdfr_dp = 0
        self.rx_sdfr_xtag = 0
        self.rx_sdfr_udf = 0
        self.rx_sdfr_mac = 0
        self.rx_apmpt_mac = 0
        self.rx_sdfr_da2 = 0
        self.rx_sdfr_sa2 = 0
        self.rx_sdfr_vid2 = 0
        self.rx_sdfr_sipv6 = 0
        self.rx_sdfr_dipv6 = 0
        self.rx_sdfr_ipv6 = 0
        self.rx_sdfr_icmpv6 = 0
        self.rx_sdfr_igmp = 0
        # for TX
        self.tx_pkt = 0
        self.tx_col = 0
        self.tx_col_multi = 0
        self.tx_col_exc = 0
        self.tx_pause = 0
        self.tx_byte = 0
        self.tx_col_total = 0
        self.tx_rate_byte = 0
        self.tx_rate_pkt = 0
        self.tx_arp_reply = 0
        self.tx_arp_request = 0
        self.tx_icmp_reply = 0
        self.tx_icmp_request = 0
        self.tx_frames_out = 0
        self.tx_timestamp = 0
        self.tx_icmpv6_reply = 0
        self.tx_icmpv6_request = 0
        self.tx_nb_solicit = 0
        self.tx_nb_advert = 0
        self.tx_router_solicit = 0
        
class NuStreamsInfoChassis:
    def __init__(self):
        # module info. from eeprom
        self.model_name = "NuStreams-700"
        self.serial_num = "0MNS70000001"
        self.mac_addr = "0022a2000001"
        self.agent_custom_code = "0/0"
        # version info. from board
        self.version_pcb = "v5"
        self.version_hw = "v0.9b001"
        self.version_fw = "v1.4b001"
        # license info. from eeprom
        self.licence_mode_hw = "Normal    "
        self.license_date_hw = "2017/12/31"
        self.license_times_hw = "100"
        self.manual_date = "2012-01-01 00:00"
        self.list_software_lic = []
        self.list_slot_power = []

class NuStreamsInfoBoard:
    def __init__(self):
        self.chassis_id = 0
        self.board_id = 1
        self.port_id = 1
        self.card_type = 100
        self.mac_addr = ""
        self.serial_num = ""
        self.manual_date = "2016/12/31"
        self.version_fw = 'v1.4b003'
        self.version_hw = 'v2.0b003'
        self.version_prom = 'v2.0b003'
        self.version_pcb = 'v5'
        self.datecode_fw = "20160729"
        self.datecode_hw = "20160729"
        self.datecode_prom = "20160729"
        # hardware license info.
        self.license_date = '2016/12/31'
        self.license_times = 100
        self.license_mode = 'Normal    '

class NuStreamsInfoPort:
    def __init__(self):
        self.chassis_id = 0
        self.board_id = 1
        self.port_id = 1
        self.card_type = 53
        self.lock_status = 0
        self.is_lock_success = 0
        self.is_select = 0
        self.is_fiber = 0
        self.is_linkdown = 0
        self.is_ping_success = 0
        self.is_txend = 0
        # protocol
        self.protocol = ns_const.PROTOCOL_MAC
        self.vlan_enable = 0
        self.vlan_id = 0
        self.vlan_pri = 1
        self.mac_my = [0]*6
        self.mac_serv = [0]*6
        self.ip_my = [0]*4
        self.ip_serv = [0]*4
        self.ipv6_my = [0]*8
        self.ipv6_serv = [0]*4
        # ping
        self.ping_ip = [0]*4
        self.ping_datalen = 32
        self.ping_ttl = 64

        self.media_speed = ns_const.MEDIA_SPEED_1G
        self.media_duplex = "Full"
        self.media_autonego = "Auto"
        self.media_signal = "Copper"
        # 20160930, TK, comment. abort. replace with port_counter_stack
        # self.port_counter = NuStreamsCounterPort()
        #20160930, TK, added. reserved a space of 1500 bytes
        self.port_counter_stack = [0]*1500
        # list append - Rx/Tx stream counter
        self.stream_counter_rx = []
        for x in range(256):
            self.stream_counter_rx.append(NuStreamsCounterRxStream())
        self.stream_counter_tx = []
        for x in range(256):
            self.stream_counter_tx.append(NuStreamsCounterTxStream())
        
        # stream number at least 1
        self.total_stream_num = 1

        # 256 streams
        self.streams = []
        for x in range(256):
            self.streams.append(nucommand.NuStreamsCommandAddEntry())

class NuStreamsInfoPing:
    def __init__(self):
        self.chassis_id = 0
        self.board_id = 1
        self.port_id = 1
        self.fromip = [0]*4
        self.frommac = [0]*6
        self.datalen = 32
        self.ttl = 128

class T451InfoBoard: # board, port is the same in T451
    def __init__(self):
        self.card_type = 0xe001
        self.card_status = 9 # card ok
        self.version_pcb = 3
        self.version_prom = 'v2.0b003'
        self.version_fw = 'v1.4b003'
        self.version_hw = 'v2.0b003'
        self.datecode_fw = "20160729"
        
        self.lock_status = 0
        self.serial_num = ""
        self.mac = [0xff]*6
        self.temp1 = 35
        self.temp2 = 35
        
        self.is_lock_success = 0
        self.is_select = 0

        self.report = t451counter.T451Counter()
            
class T451InfoChassis:
    def __init__(self):
        self.chassis_id = [0]*6
        self.version_hw = 'v2.0b003'
        self.version_fw = 'v1.4b003'
        self.status = 0  #0 off line; 1 error ; 2 upgrade ; 3 normal.
        self.model_name = ""
        self.serial_num = ""
        self.isstaticip = 0
        self.sip = ''
        self.gateway = ''
        self.mask = 24
        self.license_times = 100
        self.license_mode = 'Normal    '
        self.t451_board = []
        for idx in range(16):
            tmpStruct = T451InfoBoard()
            self.t451_board.append(tmpStruct)

class LogFileWriter:
    def __init__(self):
        self.log_file = open("pysvrcmd_%s.txt" %(time.strftime("%Y%m%d_%H%M%S", time.localtime())), "w")
    def is_closed(self):
        if self.log_file.closed == False:
            return 0
        else:
            return 1
    def close(self):
        if self.log_file.closed == False:
            self.log_file.close()
    def write(self, type, writestr):
        if self.log_file.closed == False:
            typestr = ""
            # send packet
            if type == -1:
                typestr = "(Error)"
            elif type == 0:
                typestr = "(Send)"
            # receive packet
            elif type == 1:
                typestr = "(Recv)"
            elif type == 2:
                typestr = "(Log)"
            elif type == 3:
                typestr = "(Parser)"
            else:
                typestr = "(Log)"
            self.log_file.write("(%s)%s%s\n" % (time.strftime("%H:%M:%S", time.localtime()), typestr, writestr))
# 20191005, TK, added
class OneStreamConfig:
    def __init__(self):
        self.stream_number = 1
        # utilization
        self.stream_utilization = 100
        self.stream_ifg = 96
        self.stream_ibg = 96
        self.stream_pktlen = 60
        self.stream_id = 0
        self.stream_enablerand = 0
        self.stream_beginidx = 0
        self.stream_endidx = 0

        # 20251028, move to here
        # for layer2 and layer3 parameters
        self.stream_is_vlan = 0
        #0-layer2, 1-layer3 ipv4, 2-layer3 udp, 3-layer3 ipv6, 0xd-user define
        self.stream_protocol = 0
        #vlan tag default is 0x8100
        self.stream_vlan_id = 0
        self.stream_vlan_pri = 0
        self.stream_smac = [0]*6
        self.stream_dmac = [0]*6
        self.stream_sip = [0]*4
        self.stream_dip = [0]*4
        #20161118, TK, for ARP
        self.stream_arp_smac = [0]*6
        self.stream_arp_dmac = [0]*6
        self.stream_arp_sip = [0]*4
        self.stream_arp_dip = [0]*4
        self.stream_sipv6 = [0]*16
        self.stream_dipv6 = [0]*16
        self.stream_sport = 10
        self.stream_dport = 100
        self.stream_payload = [0]*1058

        #20211207, added for error packet
        self.stream_error = 0

        #20231106, TK, added for XTAG enable
        self.stream_enableXtag = 1

        #20260717, TK, added
        self.stream_vary_mode_da = 0
        self.stream_vary_mode_sa = 0
        self.stream_vary_mode_vid = 0
        self.stream_vary_mode_dip = 0
        self.stream_vary_mode_sip = 0
        self.stream_vary_limit_da = 255
        self.stream_vary_limit_sa = 255
        self.stream_vary_limit_vid = 255
        self.stream_vary_limit_dip = 255
        self.stream_vary_limit_sip = 255
        self.stream_vary_delta_da = 1
        self.stream_vary_delta_sa = 1
        self.stream_vary_delta_vid = 1
        self.stream_vary_delta_dip = 1
        self.stream_vary_delta_sip = 1

class NuStreamsModuleSetting:
    #IsTerminate = None
    #sock = None
    #sock2 = None
    
    is_terminate = None
    def __init__(self, callback=None):
        
        #self.is_terminate = None
        self.is_connected = 0
        # 20160930, TK, added. is_locked and is_stoptest are using in counter report
        self.is_locked = 0
        self.is_stoptest = 1
        # 3s3gs=0, 3s3a=1
        self.server_type = 0
        self.server_slot = 1
        self.server_chassis = 0
        self.sock1 = None
        self.sock2 = None
        self.sock_t451 = None
        #self.client_idID = random.randrange(65535)
        self.streamcfg = OneStreamConfig()
        self.client_id = 0
        self.sequence_num = 0
        
        # for show
        #self.map_powershow = array.array('B', ['on','off','off','off','off','off','off','off','off','off','off','off','off','off','off','off']) 
        self.map_powershow = ['off','off','off','off','off','off','off','off','off','off','off','off','off','off','off','off']
        self.arr_str_cardtype = ['','','XM-RM761','XM-RM781','XM-RM751','XM-RM731','','XM-RM751L','XM-RM761L','XM-RM781L','',
        '','','','','','XM-RM661','XM-RM671','XM-RM681','','','','','','','','','','','','',
        '','','','XM-RM8812','','','XM-RM871','XM-RM881','XM-RM891','','','','','','','MGM-3s3A','','','','XM-RM8812L',
        'XM-RM871L', 'XM-RM881L', 'XM-RM891L','','','','','','','','','','','','','','','','','','','','','','','','','','','',
        '','','','','','','','','','','','','','','','','XM-RM882','XM-RM8822','XM-RM882L','','']
        self.arr_str_cardtype_new = ['','Viscount-x4T','Baron-x4T','','Viscount-x4TB','Baron-x4T','','','','','',
        'Viscount-ii4T','Baron-ii4T','','Viscount-ii4TB','Baron-x4TB','']
        
        # for setting
        self.map_powerset = array.array('B', [0,0,0,0]) 
        self.map_lock = array.array('I', [0,0,0,0,0,0,0,0,0,0])
        
        self.total_port_num = 0
        self.total_slot_num = 0
        self.ns_cmd_header = nucommand.NuStreamsCommandHeader(0, 0, self.sequence_num, 0, 0)
        # for trigger server
        self.ns_cmd_trigger = nucommand.NuStreamsCommandHeader(0, 0, self.sequence_num, 0, 0)
        # for media change
        self.ns_cmd_media = nucommand.NuStreamsCommandMediaChange(0,0,0)
        # port config, control tx/rx enable
        self.ns_cmd_simple = nucommand.NuStreamsCommandSimple(0,0,0)
        self.ns_cmd_portconfig = nucommand.NuStreamsCommandPortConfig(0,0,0)
        self.ns_cmd_starttx = nucommand.NuStreamsCommandStartTx(0,0,0)
        self.ns_cmd_rxstreamconfig = nucommand.NuStreamsCommandRxConfig(0,0,0)
        self.ns_cmd_globaltx = nucommand.NuStreamsCommandGlobalStartTx(0,0,0)
        self.ns_cmd_globalpower = nucommand.NuStreamsCommandGlobalPower(0,0,0)
        # layer 3 class
        self.ns_cmd_arpreply = nucommand.NuStreamsCommandARPReplyStart(0,0,0)
        self.ns_cmd_pingv4 = nucommand.NuStreamsCommandPingv4(0,0,0)
        self.ns_cmd_pingv6 = nucommand.NuStreamsCommandPingv6(0,0,0)
        self.ns_cmd_dhcpcfg = nucommand.NuStreamsCommandDHCPConfig(0,0,0)
        # for nic mode
        self.ns_cmd_nicset = nucommand.NuStreamsCommandNICSet(0,0,0)
        self.ns_cmd_nicsend = nucommand.NuStreamsCommandNICSend(0,0,0)
        # for ack check
        self.ns_cmd_ack = nucommand.NuStreamsCommandACK()
        
        #20170905, TK, added
        # for T451
        # 可串16台機箱
        self.t451_info_board = []
        for idx in range(16):
            tmpt451Chassis = T451InfoChassis()
            self.t451_info_board.append(tmpt451Chassis)
        self.t451_cmd_header = nucommand.T451CommandHeader(0, 0, self.sequence_num, 0)
        self.t451_cmd_ack = nucommand.T451CommandACK() # 和ns_cmd_ack同樣原理
        self.t451_cmd_config = nucommand.T451CommandAllConfig()
        self.t451_cmd_simple = nucommand.T451CommandSimple(self.t451_info_board[0].chassis_id, 0, 0, 0, 0)
        self.t451_groupmap = [0]*16 #16組
        self.t451_groupid = 0 
        self.t451_samplerate = 1

        self.ns_info_chassis = NuStreamsInfoChassis()
        self.ns_info_portlist = []
        # boardstatus, include eeprom info.
        self.ns_info_boardlist = []
        # for ping report
        #self.ns_info_pinglist = []
        # clear the ping report list
        #self.ns_info_pinglist[:] = []

        #self.log_file = open("pysvrcmd.txt", "w")
        self.log_file = LogFileWriter()
        
        # 20250811, modified, give all port own pps. reserved 64 ports
        # counter per second. 
        self.counter_per_sec = [0] * 64

        # for nic report counter
        self.nicrpt_counter = 0
        self.nicrpt_ts = 0

        # python2/3 thread function
        self.threadlock = thread.allocate_lock() if python_ver == 2 else _thread.allocate_lock()
        
        # api version
        self.ver_api = "v0.9b019"

        # Port Counter Index. initial index is 24
        self.__media_speed = ns_const.MEDIA_SPEED_1G
        self.__media_duplex = ns_const.MEDIA_DUPLEX_FULL
        self.__media_nego = ns_const.MEDIA_NEGO_AUTO
        self.__media_signal = ns_const.MEDIA_SIGNAL_COPPER
        self.__media_master_slave = ns_const.MEDIA_MASTERMODE_AUTO
        
        # Port Config
        self.portcfg_flowctrl_tx = 0
        self.portcfg_flowctrl_rx = 0

        # 0-auto tx rate(control by utilization), 1-manual tx rate(control by frame gap)
        self.manual_tx_rate = 0

        # detect stop rx capture next
        self.is_stopcapture = 0

        # set callback function
        self.callbackfunc = callback
        self.is_exist_callback = 1

        self.is_exist_callback = 1 if callback != None else 0
        
    # 20231120, TK, added. invoke the callback function at report parser
    def invoke_callback(self, cid, bid, pid, mode):
        self.callbackfunc(cid, bid, pid, mode)
    ##############################  <Tools>  ##################################
    # 20170905, TK, added. new T451 socket send
    # 20170602, TK, added. avoid the error of sending from socket, using try/exception
    def sendpkt_sock_t451(self, stream):
        # for check ack, if chassis/board/port not equal to 0xff, than check ack
            
        if self.sock_t451 != None:
            isack = 0
            ttimes = 0
            try:
                self.sequence_num += 1
                self.sock_t451.sendall(stream)
                
                if self.t451_cmd_ack.chassis_id != [0,0,0,0,0,0] and self.t451_cmd_ack.board_id != 0xff and self.t451_cmd_ack.port_id != 0xff:
                    while self.ns_cmd_ack.is_ack == 0:
                        time.sleep(0.02)
                        ttimes += 1
                        # 1 seconds break if no ack
                        if ttimes == 50:
                            break
                else:
                    isack = 1
            except:
                self.sequence_num -= 1
                print("(Error) socket1 send error!")
            return isack

    def sendpkt_sock1(self, stream):
        # for check ack, if chassis/board/port not equal to 0xff, than check ack
            
        if self.sock1 != None:
            isack = 0
            ttimes = 0
            try:
                self.sequence_num += 1
                self.sock1.sendall(stream)
                
                if self.ns_cmd_ack.chassis_id != 0xff and self.ns_cmd_ack.board_id != 0xff and self.ns_cmd_ack.port_id != 0xff:
                    while self.ns_cmd_ack.is_ack == 0:
                        time.sleep(0.02)
                        ttimes += 1
                        # 1 seconds break if no ack
                        if ttimes == 50:
                            break
                else:
                    isack = 1
            except:
                self.sequence_num -= 1
                print("(Error) socket1 send error!")
            return isack
        
    def sendpkt_sock2(self, stream):
        if self.sock2 != None:
            try:
                self.sequence_num += 1
                self.sock2.sendall(stream)
            except:
                self.sequence_num -= 1
                print("(Error) socket2 send error!")

    def set_loopbackcall(self, loopbackfunc):
        self.loopbackcall = loopbackfunc

    def loop_trigger(self):
        try:
            self.log_file.write(2, "Loop to Trigger Server")
            #print >>sys.stderr, "Trigger Server"
            while (self.is_terminate == 0):
                self.server_trigger()
                time.sleep(1)
        finally:
            self.log_file.write(2, "End Loop Trigger thread")
            #print >>sys.stderr, "End Receive data thread"


    def get_portidx(self, cid, bid, pid):
        portidx = -1
        if self.total_port_num > 0:
            for pidx in range(self.total_port_num):
                if cid == self.ns_info_portlist[pidx].chassis_id and bid == self.ns_info_portlist[pidx].board_id and pid == self.ns_info_portlist[pidx].port_id:
                    portidx = pidx
                    break
        return portidx

    def merge_to_64b(self, stream):
        return (stream[0] << 56) + (stream[1] << 48) + (stream[2] << 40) + (stream[3] << 32) + (stream[4] << 24) + (stream[5] << 16) + (stream[6] << 8) + stream[7]

    def merge_to_32b(self, stream):
        return (stream[0] << 24) + (stream[1] << 16) + (stream[2] << 8) + stream[3]

    def ip_checksum(self, ip_header, size):
        cksum = 0
        pointer = 0
        #The main loop adds up each set of 2 bytes. They are first converted to strings and then concatenated
        #together, converted to integers, and then added to the sum.
        while size > 1:
            cksum += int((str("%02x" % (ip_header[pointer],)) + 
                          str("%02x" % (ip_header[pointer+1],))), 16)
            size -= 2
            pointer += 2
        if size: #This accounts for a situation where the header is odd
            cksum += ip_header[pointer]
        cksum = (cksum >> 16) + (cksum & 0xffff)
        cksum += (cksum >>16)
        return (~cksum) & 0xFFFF
    def log_close(self):
        self.log_file.close()
        
    def show_socket_info(self):
        families = get_constants('AF_')
        types = get_constants('SOCK_')
        protocols = get_constants('IPPROTO_')
        print >>sys.stderr, 'Family  :', families[self.sock1.family]
        print >>sys.stderr, 'Type    :', types[self.sock1.type]
        print >>sys.stderr, 'Protocol:', protocols[self.sock1.proto]
    
    def get_constants(prefix):
        """Create a dictionary mapping socket module constants to their names."""
        return dict((getattr(socket, n), n)
                    for n in dir(socket)
                    if n.startswith(prefix)
                    )
    def learning(self, pidx):
        mac_learn = "ff:ff:ff:ff:ff:ff"
        self.config_stream_dmac(mac_learn)
        # 假定dmac事先已設定過
        self.config_stream_pktlen(60)
        self.config_stream_protocol(0)
        self.config_stream_streamnum(1)
        self.config_stream_utilization(0.1)
        self.set_stream(pidx, 0)
        self.config_tx_isimmediate(1)
        self.config_tx_txpkts(pidx, 10)
        self.transmit_pkts(pidx)
    ##############################  </Tools>  ##################################

    ##############################  <Counter Base>  ##################################
    def read_counter_stop(self):
        # read counter every second
        if self.total_port_num > 0:
            for pidx in range(self.total_port_num):
                # if port locked
                if self.ns_info_portlist[pidx].is_lock_success == 1: # is_lock_success=1 means self lock
                    # stop port counter
                    self.read_counter_port_stop(pidx)
                    # stop stream counter
                    self.read_counter_stream_stop(pidx)
    
    # read board status, eeprom, link status
    def read_info_module(self):
        # clear the boardstatus list
        self.ns_info_boardlist[:] = []
        # read board status and eeprom status on initial
        for pidx in range(self.total_port_num):
            if self.ns_info_portlist[pidx].port_id == 1:
                self.read_info_board(pidx)
                self.read_license_board(pidx)
            self.read_info_link(pidx)
    
    def read_counter_port_loop(self):
        #read counter every seconds
        # thread until terminate
        while (self.is_terminate == 0):
            # read counter every second
            if self.total_port_num > 0:
                for pidx in range(self.total_port_num):
                    # read counter when the port locked
                    if self.ns_info_portlist[pidx].is_lock_success == 1: # is_lock_success=1 means self lock
                        self.read_counter_port_once(pidx)
            time.sleep(1)
    
    def read_counter_stream_loop(self, pidx):
        #read counter every seconds
        # thread until terminate
        while (self.is_terminate == 0):
            # read counter every second
            self.read_counter_stream_once(pidx)
    
    ##############################  </Counter Base>  ##################################
    
    ##############################  <Server Command>  ##################################
    # info : Communicate only with Server
    # function : 
    #     server_connect - create two socket to connect with NuServer using port 4000/4001
    #     server_trigger - keep the connection between NuServer and ap
    #     server_disconnect - cut the connection between NuServer and ap

    #sock2 send
    def server_trigger(self):
        self.ns_cmd_trigger.command_id = 0x80ff
        # the seqnum+1 when trigger once
        self.ns_cmd_trigger.sequence_num = 0
        # using socket2 to transmit server command 
        if python_ver == 2:
            thread.start_new_thread(self.sendpkt_sock2, (self.ns_cmd_trigger.get_payload()+struct.pack("!I", 0),))
        else:
            _thread.start_new_thread(self.sendpkt_sock2, (self.ns_cmd_trigger.get_payload()+struct.pack("!I", 0),))
        
    # 20170905, TK, added
    # T451 used only one port - 9001
    def t451_server_connect(self, server_ip):
        with self.threadlock:
            self.is_terminate = 0
        self.t451_cmd_header.command_id = 0x80fd
        self.t451_cmd_header.sequence_num = self.sequence_num
        try:
            self.log_file.write(0, "(SocketT451) Create connection")
            self.sock_t451 = socket.create_connection((server_ip, 9001))
        except:
            self.log_file.write(-1, "(SocketT451) Could not connect to port 9001.")
            return 0
        self.log_file.write(0, "(SocketT451) CommandID = 0x80FD(Connect)")
        if python_ver == 2:
            thread.start_new_thread(self.receive_sock_t451, ())
        else:
            _thread.start_new_thread(self.receive_sock_t451, ())
        self.sock_t451.sendall(self.t451_cmd_header.get_payload()+struct.pack("!I", 0))
        self.sequence_num += 1
        time.sleep(0.1)
        return 1

    def t451_server_disconnect(self):
        with self.threadlock:
            self.is_terminate = 1
        #print >>sys.stderr, 'closing socket'
        try:
            self.log_file.write(0,"(SocketT451) Close connection")
            self.sock_t451.shutdown(socket.SHUT_RDWR)
            self.sock_t451.close()
        except:
            self.log_file.write(-1, "(SocketT451) Close socket1 error.")
        time.sleep(2)

    #20160902, return value
    #sock1/sock2 send
    def server_connect(self, server_ip):
        self.is_terminate = 0
        self.ns_cmd_header.command_id = 0x80fd
        self.ns_cmd_header.sequence_num = self.sequence_num

        # open 2 threads for 2 TCP/IP sockets
        # another way to connect with socket
        '''
        self.sock1 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_address = (server_ip, 4000)
        '''
        try:
            #self.sock1.connect(server_address)
            self.log_file.write(0, "(Socket1) Create connection")
            self.sock1 = socket.create_connection((server_ip, 4000))
            #self.sock1.setblocking(False)
        except:
            self.log_file.write(-1, "(Socket1) Could not connect to port 4000.")
            return 0
            #print("(Error)(Socket1) Could not connect to port 4000.")
        self.log_file.write(0, "(Socket1) CommandID = 0x80FD(Connect)")
        #print >>sys.stderr, '(Send)(Socket1) CommandID = 0x80FD(Connect)'
        # receive socket1 thread
        if python_ver == 2:
            thread.start_new_thread(self.receive_sock1, ())
        else:
            _thread.start_new_thread(self.receive_sock1, ())
        self.sock1.sendall(self.ns_cmd_header.get_payload()+struct.pack("!I", 0))
        self.sequence_num += 1

        time.sleep(0.1)
    
        # socket 2 connection and send
        try:
            self.log_file.write(0, "(Socket2) Create connection")
            self.sock2 = socket.create_connection((server_ip, 4001))
            #self.sock2.setblocking(False)
        except:
            self.log_file.write(-1, "(Socket2) Could not connect to port 4001.")
            return 0
            #print("(Error)(Socket2) Could not connect to port 4001.")
        self.log_file.write(0, "(Socket2) CommandID = 0x80FD(Connect)")
        #print >>sys.stderr, '(Send)(Socket2) CommandID = 0x80FD(Connect)'
        # receive socket2 thread
        #thread.start_new_thread(self.receive_sock2, (self.threadlock,))
        if python_ver == 2:
           thread.start_new_thread(self.receive_sock2, ())
        else:
           _thread.start_new_thread(self.receive_sock2, ())
        
        try:
            self.sock2.sendall(self.ns_cmd_header.get_payload()+struct.pack("!I", 0))
            self.sequence_num += 1
        except:
            self.log_file.write(-1, "(Error) socket2 send error!")
        
        # wait to create the NSInfoPortList list from 0x80fe command
        time.sleep(0.1)
        # v0.1b001, 20160908, read boardstatus, link status, and eeprom by thread
        # thread.start_new_thread(self.read_info_module, ())
        return 1
        # start counter static command, using readcounter in transmit pkt function
        # create a loop counter reader
        #thread.start_new_thread(self.LoopReadCounter, ())
        
        

    def server_disconnect(self):
        self.is_terminate = 1
        time.sleep(1)
        #print >>sys.stderr, 'closing socket'
        try:
            self.log_file.write(0,"(Socket1) Close connection")
            self.sock1.shutdown(socket.SHUT_RDWR)
            self.sock1.close()
        except:
            self.log_file.write(-1, "(Socket1) Close socket1 error.")
            #print("(Error)(Socket1) Close socket1 error.")

        try:
            self.log_file.write(0, "(Socket2) Close connection")
            self.log_close() #close the log file. 20170724, TK, move from end to here
            self.sock2.shutdown(socket.SHUT_RDWR)
            self.sock2.close()
        except:
            self.log_file.write(-1, "(Socket2) Close socket2 error.")
            #print("(Error)(Socket2) Close socket2 error.")
        time.sleep(2)
        
        # no while loop to wait receive, using close is enought
        
    ##############################  </Server Command>  ##################################

    ##############################  <T451 Command>  ##################################
    # info : Communicate with T451 Module through NuServer
    # function : 
    #     t451_read_info_board(0x10)
    #     t451_read_info_allport(0xC1)
    #     t451_read_license_chassis(0xC2)
    #     t451_read_license_board(0xE0)
    #     t451_read_info_sample(0xB1)
    #     t451_write_info_license_chassis(0xC3)
    #     t451_write_info_license(0xE1)
    #     t451_port_lock(0x11)
    #     t451_open_relay(0xC0)
    #     t451_start_loading(0xA0)
    #     t451_stop_loading(0xA1)
    #     t451_start_sample(0xA7)
    #     t451_start_connect(0xA8)
    #     t451_start_disconnect(0xA9)
    #     t451_start_overload(0xAA)
    #     t451_start_shorttest(0xAB)
    #     t451_start_underload(0xBF)
    #     t451_start_lldpload(0xD1)
    #     t451_stop_test(0xAC)
    #     t451_counter_read_start(0xAD)
    #     t451_counter_read_stop(0xAE)
    #     t451_counter_read_once(0xAF)
    #     t451_counter_clear(0xB0)
    #  For Group
    #     t451_set_group(0xB7)
    #     t451_gopen_relay(0xC0)
    #     t451_gstop_test(0xAC)
    #     t451_gcounter_read_start(0xAD)
    #     t451_gcounter_read_stop(0xAE)
    #     t451_gcounter_clear(0xB0)
    #  For Config.
    #     t451_config_poeclass
    #     t451_config_duttype
    #     t451_config_alternative
    #     t451_config_cabletype
    #     t451_config_cablelen
    #     t451_config_copperloss
    #     t451_config_poweralert
    #     t451_config_overheadthr
    #     t451_config_overheadalert
    #     t451_config_reporttype
    #     t451_config_voltpoweron
    #     t451_config_voltpoweroff
    #     t451_config_voltpowergood
    #     t451_config_voltpowerunder
    #     t451_config_voltpowertoohigh
    #     t451_config_lldpenable
    #     t451_config_lldploadingfirst
    #     t451_config_lldpreportloading
    #     t451_config_lldpflag
    #     t451_config_lldpinterval
    #     t451_config_conn_loadingflag
    #     t451_config_conn_timeout
    #     t451_config_conn_waittime
    #     t451_config_over_power
    #     t451_config_over_timeout
    #     t451_config_under_power
    #     t451_config_under_timeout
    #     t451_config_short_timeout
    #     t451_config_disconn_timeout
    #     t451_config_load_mode
    #     t451_config_load_minpower
    #     t451_config_load_maxpower
    #     t451_config_load_delay
    #     t451_config_load_normalpower
    #     t451_set_test
    #  Report:
    #     t451_report_connect
    #     t451_report_disconnect
    #     t451_report_oberload
    #     t451_report_underload
    #     t451_report_shortcircuit
    #     t451_report_loading

    def config_t451cmd_header(self, cmd_id, sub_cmd_id):
        self.t451_cmd_header.command_id = cmd_id
        self.t451_cmd_header.sequence_num = self.sequence_num
        self.t451_cmd_header.sub_command_id = sub_cmd_id
        self.t451_cmd_header.client_id = self.client_id # from 0x80fd
        self.t451_cmd_header.group_id = 0xff # set 0xff first

    def config_t451ack(self, cmd_id, cidx, sidx):
        self.t451_cmd_ack.ack_cmd = cmd_id + 0x8000
        self.t451_cmd_ack.is_ack = 0
        if(cidx == -1):
            self.t451_cmd_ack.chassis_id = [0xff]*6
            self.t451_cmd_ack.board_id = 0xff
            self.t451_cmd_ack.port_id = 0xff
        else:
            
            self.t451_cmd_ack.chassis_id = self.t451_info_board[cidx].chassis_id
            self.t451_cmd_ack.board_id = sidx
            self.t451_cmd_ack.port_id = 1

    def t451_port_mark(self, cidx, bid):
        if cidx >=0 and bid >= 0:
            mapnum = math.pow(2, bid)
            self.t451_groupmap[cidx] |= int(mapnum) # '|' operator must be int or float
        
    def t451_port_unmark(self, cidx, bid):
        if cidx >=0 and bid >= 0:
            mapnum = math.pow(2, bid)
            mapnum = (mapnum^0xFFFFFFFF)
            self.t451_groupmap[cidx] &= int(mapnum) # '&' operator must be int or float
             
    #     t451_read_info_board(0x10)
    def t451_read_info_board(self, cidx, sidx):
        if cidx >=0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x0010(Board Status), Slot %d' % sidx)
            self.config_t451cmd_header(0x10, 0)
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*36
            if cidx >= 0 and sidx >= 0:
                stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B36B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, *payload)
                if python_ver == 2:
                    thread.start_new_thread(self.sendpkt_sock_t451, (stream,))
                else:
                    _thread.start_new_thread(self.sendpkt_sock_t451, (stream,))
                time.sleep(0.2)
    
    #     t451_open_relay(0xC0)
    def t451_open_relay(self, cidx, sidx, isopen):
        if cidx >=0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00C0(OpenRelay), Slot %d' % sidx)
            self.config_t451cmd_header(0xC0, 0)
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*16
            if cidx >= 0 and sidx >= 0:
                stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2BI16B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, isopen, *payload)
                self.sendpkt_sock_t451(stream)

    #     t451_read_info_allport(0xC1)
    def t451_read_info_allport(self):
        self.log_file.write(0, '(SocketT451) CommandID = 0x00C1(Read All Port Info.)')
        self.config_t451cmd_header(0xC1, 0)
        payload = [0]*16
        stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B16B", self.t451_cmd_simple.chassis_id[0], self.t451_cmd_simple.chassis_id[1], self.t451_cmd_simple.chassis_id[2], 
                                                                self.t451_cmd_simple.chassis_id[3], self.t451_cmd_simple.chassis_id[4], self.t451_cmd_simple.chassis_id[5], 
                                                                self.t451_cmd_simple.board_id, self.t451_cmd_simple.port_id, *payload)
        self.config_t451gack(self.t451_cmd_header.command_id)
        self.sendpkt_sock_t451(stream)

    #     t451_read_license_chassis(0xC2), default from address 0 to address 256
    def t451_read_license_chassis(self, cidx):
        if cidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00C2(Read Chassis EEPROM), Chassis Index %d' % cidx)
            self.config_t451cmd_header(0xC2, 0)
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, 0)
            payload = [0]*16
            self.t451_cmd_simple.param1 = 0 # start from address 0
            self.t451_cmd_simple.param2 = 256 # to address 256
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B2H16B", self.t451_cmd_simple.chassis_id[0], self.t451_cmd_simple.chassis_id[1], self.t451_cmd_simple.chassis_id[2], 
                                                                  self.t451_cmd_simple.chassis_id[3], self.t451_cmd_simple.chassis_id[4], self.t451_cmd_simple.chassis_id[5], 
                                                                  self.t451_cmd_simple.board_id, self.t451_cmd_simple.port_id, self.t451_cmd_simple.param1, self.t451_cmd_simple.param2, *payload)
            self.sendpkt_sock_t451(stream)

    #     t451_read_info_sample(0xB1)
    def t451_read_info_sample(self, cidx, sidx):
        if cidx >=0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00B1(Read Sample Counter), Slot %d' % sidx)
            self.config_t451cmd_header(0xB1, 0)
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*32
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B32B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, *payload)
            self.sendpkt_sock_t451(stream)

    # t451 lock port is one by boe
    #     t451_port_lock(0x11)  
    def t451_port_lock(self, cidx, sidx, status):
        if cidx >= 0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x0011(Lock Port), Slot %d' % sidx)
            self.config_t451cmd_header(0x11, status) # lock status means 
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*12
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B12B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, *payload)
            self.sendpkt_sock_t451(stream)
    
    #     t451_start_loading(0xA0)
    def t451_start_loading(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00A0(Start Loading Test), Slot %d' % sidx)
            self.config_t451cmd_header(0xA0, 0) # start loading
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*16
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B16B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, *payload)
            #self.sendpkt_sock1(stream)
            self.sendpkt_sock_t451(stream)

    #     t451_stop_loading(0xA1)
    def t451_stop_loading(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00A1(Stop Loading Test), Slot %d' % sidx)
            self.config_t451cmd_header(0xA1, 0) # stop loading
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*32
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B32B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, *payload)
            self.sendpkt_sock_t451(stream)

    #     t451_start_sample(0xA7)
    def t451_start_sample(self, cidx, sidx):
        if cidx >=0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00A7(Start Sample Test), Slot %d' % sidx)
            self.config_t451cmd_header(0xA7, 0) # start sample
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*32
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B32B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, *payload)
            self.sendpkt_sock_t451(stream)

    #     t451_start_connect(0xA8)
    def t451_start_connect(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00A8(Start Connect Test), Slot %d' % sidx)
            self.config_t451cmd_header(0xA8, 0) # start connect
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*12
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B12B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, *payload)
            self.sendpkt_sock_t451(stream)

    #     t451_start_disconnect(0xA9)
    def t451_start_disconnect(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00A9(Start Disconnect Test), Slot %d' % sidx)
            self.config_t451cmd_header(0xA9, 0) # start disconnect
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*16
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B16B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, *payload)
            self.sendpkt_sock_t451(stream)

    #     t451_start_overload(0xAA)
    def t451_start_overload(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00AA(Start Overload Test), Slot %d' % sidx)
            self.config_t451cmd_header(0xAA, 0) # start overload
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*16
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B16B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, *payload)
            self.sendpkt_sock_t451(stream)

    #     t451_start_underload(0xBF)
    def t451_start_underload(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00BF(Start Underload Test), Slot %d' % sidx)
            self.config_t451cmd_header(0xBF, 0) # underload test
            payload = [0]*16
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B16B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, *payload)
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            self.sendpkt_sock_t451(stream)

    #     t451_start_shorttest(0xAB)
    def t451_start_shorttest(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00AB(Start Short Circuit Test), Slot %d' % sidx)
            self.config_t451cmd_header(0xAB, 0) # Short Circuit test
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*16
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B16B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, *payload)
            self.sendpkt_sock_t451(stream)

    #     t451_start_lldpload(0xD1)
    def t451_start_lldpload(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00D1(Start LLDP loading Test), Slot %d' % sidx)
            self.config_t451cmd_header(0xD1, 0) # start lldp loading test
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*32
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B32B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, *payload)
            self.sendpkt_sock_t451(stream)

    #     t451_stop_test(0xAC)
    def t451_stop_test(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00AC(Stop Test), Slot %d' % sidx)
            self.config_t451cmd_header(0xAC, 0) # Stop test
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*16
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B16B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, *payload)
            self.sendpkt_sock_t451(stream)

    #   t451_read_license_board(0xE0)
    def t451_read_license_board(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00E0(Read Port EEPROM), Slot %d' % sidx)
            self.config_t451cmd_header(0xE0, 0)
            payload = [0]*32
            # read length 256 from address 0 
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B2H32B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, 0, 256, *payload)
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            self.sendpkt_sock_t451(stream)

    #     t451_counter_read_start(0xAD)
    def t451_counter_read_start(self, cidx, sidx, rate):
        if cidx >= 0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00AD(Start Read Port Counter), Slot %d' % sidx)
            self.config_t451cmd_header(0xAD, 0)
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*26
            interval = 1*1000//rate
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2BH26B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, interval, *payload)
            self.sendpkt_sock_t451(stream)

    #     t451_counter_read_stop(0xAE)
    def t451_counter_read_stop(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00AE(Stop Read Port Counter), Slot %d' % sidx)
            self.config_t451cmd_header(0xAE, 0)
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*16
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B16B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, *payload)
            self.sendpkt_sock_t451(stream)

    #     t451_counter_read_once(0xAF)
    def t451_counter_read_once(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00AF(Read Port Counter Once), Slot %d' % sidx)
            self.config_t451cmd_header(0xAF, 0)
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*32
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B32B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, *payload)
            self.sendpkt_sock_t451(stream)

    #     t451_counter_clear(0xB0)
    def t451_counter_clear(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00B0(Clear Port Counter), Slot %d' % sidx)
            self.config_t451cmd_header(0xB0, 0)
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            payload = [0]*32
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B32B", self.t451_info_board[cidx].chassis_id[0], self.t451_info_board[cidx].chassis_id[1], self.t451_info_board[cidx].chassis_id[2],
                                                                      self.t451_info_board[cidx].chassis_id[3], self.t451_info_board[cidx].chassis_id[4], self.t451_info_board[cidx].chassis_id[5],
                                                                      sidx, 1, *payload)
            self.sendpkt_sock_t451(stream)

    ############################################################
    # For Group
    ############################################################

    #     t451_set_group(0xB7)
    def t451_set_group(self, gid):
        if gid >= 0:
            # the cmd header is dont care
            self.log_file.write(0, '(SocketT451) CommandID = 0x00B7(Set Group), Group ID = %d' % gid)
            self.config_t451cmd_header(0xB7, 0)
            self.config_t451gack(self.t451_cmd_header.command_id)
            self.t451_cmd_header.sub_command_id = 1 # dont know why
            self.t451_cmd_header.group_id = gid
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B", self.t451_cmd_simple.chassis_id[0], self.t451_cmd_simple.chassis_id[1], self.t451_cmd_simple.chassis_id[2], 
                                                                  self.t451_cmd_simple.chassis_id[3], self.t451_cmd_simple.chassis_id[4], self.t451_cmd_simple.chassis_id[5], 
                                                                  self.t451_cmd_simple.board_id, self.t451_cmd_simple.port_id)
            # set 16 chassis group
            for lidx in range(16):
                flag = 0
                if self.t451_groupmap[lidx] != 0:
                    flag = 1
                tmpstream = struct.pack("!2B6BI", flag, 0, self.t451_info_board[lidx].chassis_id[0], self.t451_info_board[lidx].chassis_id[1], self.t451_info_board[lidx].chassis_id[2]
                                        , self.t451_info_board[lidx].chassis_id[3], self.t451_info_board[lidx].chassis_id[4], self.t451_info_board[lidx].chassis_id[5], self.t451_groupmap[lidx])
                stream += tmpstream
            self.sendpkt_sock_t451(stream)

    def config_t451gack(self, cmd_id):
        self.t451_cmd_ack.ack_cmd = cmd_id + 0x8000
        self.t451_cmd_ack.is_ack = 0
        self.t451_cmd_ack.chassis_id = [0xff]*6
        self.t451_cmd_ack.board_id = 0xff
        self.t451_cmd_ack.port_id = 0xff
        
    #     t451_gopen_relay(0xC0)
    def t451_gopen_relay(self, gid, isopen):
        if gid >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00C0(OpenRelay) - Group')
            self.config_t451cmd_header(0xC0, 0)
            self.config_t451gack(self.t451_cmd_header.command_id)
            self.t451_cmd_header.group_id = gid
            self.t451_cmd_simple.param1 = isopen
            payload = [0]*16
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2BH16B", self.t451_cmd_simple.chassis_id[0], self.t451_cmd_simple.chassis_id[1], self.t451_cmd_simple.chassis_id[2], 
                                                                  self.t451_cmd_simple.chassis_id[3], self.t451_cmd_simple.chassis_id[4], self.t451_cmd_simple.chassis_id[5], 
                                                                  self.t451_cmd_simple.board_id, self.t451_cmd_simple.port_id, self.t451_cmd_simple.param1, *payload)
            self.sendpkt_sock_t451(stream)

    #     t451_gstop_test(0xAC)
    def t451_gstop_test(self, gid):
        if gid >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00AC(Stop Test) - Group')
            self.config_t451cmd_header(0xAC, 0) # Stop test
            self.config_t451gack(self.t451_cmd_header.command_id)
            self.t451_cmd_header.group_id = gid
            payload = [0]*16
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B16B", self.t451_cmd_simple.chassis_id[0], self.t451_cmd_simple.chassis_id[1], self.t451_cmd_simple.chassis_id[2], 
                                                                  self.t451_cmd_simple.chassis_id[3], self.t451_cmd_simple.chassis_id[4], self.t451_cmd_simple.chassis_id[5], 
                                                                  self.t451_cmd_simple.board_id, self.t451_cmd_simple.port_id, *payload)
            self.sendpkt_sock_t451(stream)

    #     t451_gcounter_read_start(0xAD)
    def t451_gcounter_read_start(self, gid, rate):
        if gid >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00AD(Start Read Port Counter) - Group')
            self.config_t451cmd_header(0xAD, 0)
            self.config_t451gack(self.t451_cmd_header.command_id)
            self.t451_cmd_header.group_id = gid
            payload = [0]*10
            interval = 1*1000//rate
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2BH10B", self.t451_cmd_simple.chassis_id[0], self.t451_cmd_simple.chassis_id[1], self.t451_cmd_simple.chassis_id[2], 
                                                                  self.t451_cmd_simple.chassis_id[3], self.t451_cmd_simple.chassis_id[4], self.t451_cmd_simple.chassis_id[5], 
                                                                  self.t451_cmd_simple.board_id, self.t451_cmd_simple.port_id, interval, *payload)
            self.sendpkt_sock_t451(stream)

    #     t451_gcounter_read_stop(0xAE)
    def t451_gcounter_read_stop(self, gid):
        if gid >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00AE(Stop Port Counter) - Group')
            self.config_t451cmd_header(0xAE, 0)
            self.config_t451gack(self.t451_cmd_header.command_id)
            self.t451_cmd_header.group_id = gid
            payload = [0]*16
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B16B", self.t451_cmd_simple.chassis_id[0], self.t451_cmd_simple.chassis_id[1], self.t451_cmd_simple.chassis_id[2], 
                                                                  self.t451_cmd_simple.chassis_id[3], self.t451_cmd_simple.chassis_id[4], self.t451_cmd_simple.chassis_id[5], 
                                                                  self.t451_cmd_simple.board_id, self.t451_cmd_simple.port_id, *payload)
            self.sendpkt_sock_t451(stream)

    #     t451_gcounter_clear(0xB0)
    def t451_gcounter_clear(self, gid):
        if gid >= 0:
            self.log_file.write(0, '(SocketT451) CommandID = 0x00B0(Clear Port Counter) - Group')
            self.config_t451cmd_header(0xB0, 0)
            self.config_t451gack(self.t451_cmd_header.command_id)
            self.t451_cmd_header.group_id = gid
            payload = [0]*16
            stream = self.t451_cmd_header.get_payload()+struct.pack("!6B2B16B", self.t451_cmd_simple.chassis_id[0], self.t451_cmd_simple.chassis_id[1], self.t451_cmd_simple.chassis_id[2], 
                                                                  self.t451_cmd_simple.chassis_id[3], self.t451_cmd_simple.chassis_id[4], self.t451_cmd_simple.chassis_id[5], 
                                                                  self.t451_cmd_simple.board_id, self.t451_cmd_simple.port_id, *payload)
            self.sendpkt_sock_t451(stream)

    ############################################################
    # For Config.
    ############################################################

    def t451_config_poeclass(self, val):
        self.t451_cmd_config.poeclass = val

    def t451_config_duttype(self, val):
        self.t451_cmd_config.duttype = val

    def t451_config_alternative(self, val):
        self.t451_cmd_config.alternative = val
        self.t451_cmd_config.alternative |= 0x80000000 # enable alternative detect

    def t451_config_cabletype(self, val):
        self.t451_cmd_config.cabletype = val

    def t451_config_cablelen(self, val):
        self.t451_cmd_config.cablelen = val

    def t451_config_copperloss(self, val):
        self.t451_cmd_config.copperloss = val

    def t451_config_poweralert(self, val):
        self.t451_cmd_config.poweralert = val

    def t451_config_tempthreshold(self, val):
        self.t451_cmd_config.overheadthr = val

    def t451_config_tempalert(self, val):
        self.t451_cmd_config.overheadalert = val

    def t451_config_reporttype(self, val):
        self.t451_cmd_config.reporttype = val

    def t451_config_voltpoweron(self, val):
        self.t451_cmd_config.voltpoweron = val

    def t451_config_voltpoweroff(self, val):
        self.t451_cmd_config.voltpoweroff = val

    def t451_config_voltpowergood(self, val):
        self.t451_cmd_config.voltpowergood = val

    def t451_config_voltpowerunder(self, val):
        self.t451_cmd_config.voltpowerunder = val

    def t451_config_voltpowertoohigh(self, val):
        self.t451_cmd_config.voltpowertoohigh = val

    def t451_config_lldpenable(self, val):
        self.t451_cmd_config.lldpenable = val
    
    def t451_config_lldploadingfirst(self, val):
        self.t451_cmd_config.lldploadingfirst = val

    def t451_config_lldpreportloading(self, val):
        self.t451_cmd_config.lldpreportloading = val

    def t451_config_lldpflag(self, val):
        self.t451_cmd_config.lldpflag = val

    def t451_config_lldpinterval(self, val):
        self.t451_cmd_config.lldpinterval = val

    def t451_config_conn_loadingflag(self, val):
        self.t451_cmd_config.conn_loadingflag = val

    def t451_config_conn_timeout(self, val):
        self.t451_cmd_config.conn_timeout = val

    def t451_config_conn_waittime(self, val):
        self.t451_cmd_config.conn_waittime = val

    def t451_config_over_power(self, val):
        self.t451_cmd_config.over_power = val

    def t451_config_over_timeout(self, val):
        self.t451_cmd_config.over_timeout = val
    
    def t451_config_under_power(self, val):
        self.t451_cmd_config.under_power = val

    def t451_config_under_timeout(self, val):
        self.t451_cmd_config.under_timeout = val

    def t451_config_short_timeout(self, val):
        self.t451_cmd_config.short_timeout = val

    def t451_config_disconn_timeout(self, val):
        self.t451_cmd_config.disconn_timeout = val

    def t451_config_load_mode(self, val):
        self.t451_cmd_config.load_mode = val

    def t451_config_load_powermin(self, val):
        self.t451_cmd_config.load_minpower = val

    def t451_config_load_powermax(self, val):
        self.t451_cmd_config.load_maxpower = val

    def t451_config_load_delay(self, index, val):
        if index >= 0:
            self.t451_cmd_config.load_delay[index] = val

    def t451_config_load_normalpower(self, index, val):
        if index >= 0:
            self.t451_cmd_config.load_normalpower[idx] = val

    def t451_set_test(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.t451_info_board[cidx].t451_board[sidx].report.counter_idx = 0 #20170928, clear counter index
            self.log_file.write(0, '(SocketT451) CommandID = 0x00B8(Set All Test Config), Slot %d' % sidx)
            self.config_t451cmd_header(0xB8, 0)
            self.config_t451ack(self.t451_cmd_header.command_id, cidx, sidx)
            for idx in range(6):
                self.t451_cmd_config.chassis_id[idx] = self.t451_info_board[cidx].chassis_id[idx]
            self.t451_cmd_config.board_id = sidx
            self.t451_cmd_config.port_id = 1
            stream = self.t451_cmd_header.get_payload()+self.t451_cmd_config.get_payload()
            self.sendpkt_sock_t451(stream)

    def t451_report_connect(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.t451_info_board[cidx].t451_board[sidx].report.show_connect()

    def t451_report_disconnect(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.t451_info_board[cidx].t451_board[sidx].report.show_disconnect()

    def t451_report_overload(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.t451_info_board[cidx].t451_board[sidx].report.show_overload()

    def t451_report_underload(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.t451_info_board[cidx].t451_board[sidx].report.show_underload()

    def t451_report_shortcircuit(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.t451_info_board[cidx].t451_board[sidx].report.show_shortcircuit()

    def t451_report_loading(self, cidx, sidx):
        if cidx >= 0 and sidx >= 0:
            self.t451_info_board[cidx].t451_board[sidx].report.show_loading()
     

    ##############################  </T451 Command>  ##################################

    ##############################  <Comman Command>  ##################################
    # info : Communicate with NuStreams Module through NuServer
    # function : 
    #     port_mark - 
    #     port_unmark - 
    #     port_lock - 
    #     port_unlock - 
    #     read_info_board - 
    #     read_license_board -
    #     read_info_link - 
    #     clear_counter_port - 
    #     clear_counter_stream -
    #     read_counter_port_once - 
    #     read_counter_port_start - 
    #     read_counter_port_stop - 
    #     read_counter_stream_once - 
    #     read_counter_stream_start - 
    #     read_counter_stream_stop - 
    #     config_media_speed - 
    #     config_media_duplex - 
    #     config_media_autonego - 
    #     config_media_signal - 
    #     set_media - 
    #     config_tx_txtime - 
    #     config_tx_txpkts - 
    #     config_tx_isimmediate - 
    #     config_stream_streamnum - 
    #     config_stream_utilization - 
    #     config_stream_enable_randomlen - 
    #     config_stream_pktlen - 
    #     config_stream_streamid - 
    #     config_stream_enable_vlan - 
    #     config_stream_vlan_id - 
    #     config_stream_vlan_pri - 
    #     config_stream_smac - 
    #     config_stream_dmac - 
    #     config_stream_sip - 
    #     config_stream_dip - 
    #     config_stream_sport - 
    #     config_stream_dport - 
    #     config_stream_arp_smac - 
    #     config_stream_arp_dmac - 
    #     config_stream_arp_sip - 
    #     config_stream_arp_dip - 
    #     config_stream_protocol - 
    #     config_ping
    #     set_stream - 
    #     set_config_tx - 
    #     set_config_port - 
    #     set_config_rxstream - 
    #     transmit_pkts - 
    #     transmit_pkts_sync - 
    #     capture_frames_start - 
    #     capture_frames_stop - 
    #     analysis_pktlist
    #     show_packet_content
    #     show_packet_info
    #     config_ping_num_ping
    #     config_ping_num_arp
    #     config_ping_num_ndp
    #     config_ping_sip
    #     config_ping_dip
    #     config_ping_gip
    #     config_ping_smac
    #     config_ping_sipv6
    #     config_ping_dipv6
    #     config_ping_gipv6
    #     pingv4_send - 
    #     pingv6_send
	#     config_arp_enablenode
    #     config_arp_mac
    #     config_arp_vlan
    #     config_arp_ipv4
    #     config_arp_gateway
    #     config_arp_ipv6
    #     config_arp_gatewayv6
    #     arp_reply_start
    #     arp_reply_stop
    #     config_dhcp_mac
    #     dhcp_set
    #     dhcp_discovery
    #     loopback_disable
    #     loopback_layer1
    #     loopback_layer2
    #     config_port_flowctrl_tx
    #     config_port_flowctrl_rx

    def clear_counter_nicrpt(self):
        self.nicrpt_counter = 0

    def port_learning(self, pidx, protocol, length, count):
        self.config_stream_pktlen(length)
        self.config_stream_enable_randomlen(0)
        # protocol
        self.config_stream_enable_vlan(0)
        macaddr = "00:22:A2:%02X:%02X:%02X"%(self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id)
        self.config_stream_smac(macaddr)
        macaddr = "FF:FF:FF:FF:FF:FF"
        self.config_stream_dmac(macaddr)
        self.config_stream_utilization(1)
        # protocol=1 means layer3, 2 means udp, 0 means layer2, d means user define
        self.config_stream_protocol(protocol)
        # set total streams number
        self.config_stream_streamnum(1)
        # set stream 1
        self.set_stream(pidx, 0)
        # start port 1 rx stream
        self.set_config_rxstream(pidx)
        self.config_tx_txpkts(pidx, count)
        self.config_tx_isimmediate(1)
        #print("(learning)port %d learning" %(pidx))
        self.transmit_pkts(pidx)
    
    def power_on(self, sid):
        if self.server_slot == 5 and sid > 6:
            sid = sid-2
        mapidx = int((sid)/8)
        mapnum = 2**(sid%8)
        self.map_powerset[mapidx] |= mapnum
    def power_off(self, sid):
        if self.server_slot == 5 and sid > 6:
            sid = sid-2
        mapidx = int((sid)/8)
        mapnum = 2**(sid%8)
        mapnum = (mapnum^0xFF)
        self.map_powerset[mapidx] &= mapnum

    def port_mark(self, cid, bid, pid):
        if self.server_type == 1:
            mapidx = int((bid-1)/4)
            mapnum = (2**(pid-1))*(256**((bid-1)%4))
        elif self.server_type == 0:
            mapidx = int((bid-2)/4)
            mapnum = (2**(pid-1))*(256**((bid-2)%4))
        self.map_lock[mapidx] |= mapnum
        
    def port_unmark(self, cid, bid, pid):
        if self.server_type == 1:
            mapidx = (bid-1)/4
            mapnum = (2**(pid-1))*(256**((bid-1)%4))
            mapnum = (mapnum^0xFFFFFFFF)
        elif self.server_type == 0:
            mapidx = (bid-2)/4
            mapnum = (2**(pid-1))*(256**((bid-2)%4))
            mapnum = (mapnum^0xFFFFFFFF)
        self.map_lock[mapidx] &= mapnum

    def config_ack(self, cmd_id, pidx):
        self.ns_cmd_ack.ack_cmd = cmd_id + 0x8000
        self.ns_cmd_ack.is_ack = 0
        if(pidx == -1):
            self.ns_cmd_ack.chassis_id = 0xff
            self.ns_cmd_ack.board_id = 0xff
            self.ns_cmd_ack.port_id = 0xff
        else:
            self.ns_cmd_ack.chassis_id = self.ns_info_portlist[pidx].chassis_id
            self.ns_cmd_ack.board_id = self.ns_info_portlist[pidx].board_id
            self.ns_cmd_ack.port_id = self.ns_info_portlist[pidx].port_id

    def port_group(self, cid, gid, groupmap):
        self.log_file.write(0, "(Socket1) CommandID = 0x0017(Setup Group)")
        self.ns_cmd_header.command_id = 0x17
        self.ns_cmd_header.sequence_num = self.sequence_num
        ns_chassID = 0xffff
        ns_boardID = 0xff
        ns_portID = 0xff
        ns_reserved = [0xff] * 35
        self.ns_cmd_header.reserved[0] = 0
        self.ns_cmd_header.reserved[1] = 0
        # using socket1 to transmit the module card command
        groupcmd = struct.pack("!H2B5IB35B", ns_chassID, ns_boardID, ns_portID, cid,
                               groupmap[0], groupmap[1], groupmap[2], groupmap[3], gid, *ns_reserved)
        stream = self.ns_cmd_header.get_payload() + groupcmd
        self.config_ack(self.ns_cmd_header.command_id, -1)
        self.sendpkt_sock1(stream)
        # sleep for waiting port status return
        time.sleep(1)
        return 1

    def port_lock(self):
        self.is_locked = 1
        self.log_file.write(0, "(Socket1) CommandID = 0x001E(Port Lock)")
        self.ns_cmd_header.command_id = 0x1e
        self.ns_cmd_header.sequence_num = self.sequence_num
        ns_chassID = 0xffff
        ns_boardID = 0xff
        ns_portID = 0xff
        ns_pwd = 0
        ns_lock = 1
        ns_reserved = [0xff] * 30
        self.ns_cmd_header.reserved[0] = 0
        self.ns_cmd_header.reserved[1] = 0
        # using socket1 to transmit the module card command
        if self.server_type == 1:
            lockcmd = struct.pack("!H2B12IH30B", ns_chassID, ns_boardID, ns_portID, self.server_chassis, self.map_lock[0], self.map_lock[1], self.map_lock[2], self.map_lock[3], self.map_lock[4], self.map_lock[5], self.map_lock[6], self.map_lock[7], self.map_lock[8], self.map_lock[9], ns_pwd, ns_lock, *ns_reserved)
        elif self.server_type == 0:
            lockcmd = struct.pack("!H2B6IH30B", ns_chassID, ns_boardID, ns_portID, self.server_chassis, self.map_lock[0], self.map_lock[1], self.map_lock[2], self.map_lock[3], ns_pwd, ns_lock, *ns_reserved)
        stream = self.ns_cmd_header.get_payload()+lockcmd
        self.config_ack(self.ns_cmd_header.command_id, -1)
        self.sendpkt_sock1(stream)
        # sleep for waiting port status return
        time.sleep(1)
        return 1

    def port_unlock(self):
        self.is_locked = 0
        # 20160804, stop all counter report
        self.read_counter_stop()

        self.is_stoptest = 1
        self.log_file.write(0, "(Socket1) CommandID = 0x001E(Port Unlock)")
        self.ns_cmd_header.command_id = 0x1e
        self.ns_cmd_header.sequence_num = self.sequence_num
        ns_chassID = 0xffff
        ns_boardID = 0xff
        ns_portID = 0xff
        ns_pwd = 0
        ns_unlock = 0
        ns_reserved = [0xff] * 30
        self.ns_cmd_header.reserved[0] = 0
        self.ns_cmd_header.reserved[1] = 0
        if self.server_type == 1:
            lockcmd = struct.pack("!H2B12IH30B", ns_chassID, ns_boardID, ns_portID, self.server_chassis, self.map_lock[0], self.map_lock[1], self.map_lock[2], self.map_lock[3], self.map_lock[4], self.map_lock[5], self.map_lock[6], self.map_lock[7], self.map_lock[8], self.map_lock[9], ns_pwd, ns_unlock, *ns_reserved)
        elif self.server_type == 0:
            lockcmd = struct.pack("!H2B6IH30B", ns_chassID, ns_boardID, ns_portID, self.server_chassis, self.map_lock[0], self.map_lock[1], self.map_lock[2], self.map_lock[3], ns_pwd, ns_unlock, *ns_reserved)
        stream = self.ns_cmd_header.get_payload()+lockcmd
        self.config_ack(self.ns_cmd_header.command_id, -1)
        self.sendpkt_sock1(stream)
        time.sleep(1)

    def port_lock_force(self):
        self.is_locked = 1
        self.log_file.write(0, "(Socket1) CommandID = 0x001E(Port Lock)")
        self.ns_cmd_header.command_id = 0x1e
        self.ns_cmd_header.sequence_num = self.sequence_num
        ns_chassID = 0xffff
        ns_boardID = 0xff
        ns_portID = 0xff
        ns_pwd = 0xffab1234
        ns_lock = 1
        ns_reserved = [0xff] * 30
        self.ns_cmd_header.reserved[0] = 0
        self.ns_cmd_header.reserved[1] = 0
        # using socket1 to transmit the module card command
        if self.server_type == 1:
            lockcmd = struct.pack("!H2B12IH30B", ns_chassID, ns_boardID, ns_portID, self.server_chassis, self.map_lock[0], self.map_lock[1], self.map_lock[2], self.map_lock[3], self.map_lock[4], self.map_lock[5], self.map_lock[6], self.map_lock[7], self.map_lock[8], self.map_lock[9], ns_pwd, ns_lock, *ns_reserved)
        elif self.server_type == 0:
            lockcmd = struct.pack("!H2B6IH30B", ns_chassID, ns_boardID, ns_portID, self.server_chassis, self.map_lock[0], self.map_lock[1], self.map_lock[2], self.map_lock[3], ns_pwd, ns_lock, *ns_reserved)
        stream = self.ns_cmd_header.get_payload()+lockcmd
        self.config_ack(self.ns_cmd_header.command_id, -1)
        self.sendpkt_sock1(stream)
        # sleep for waiting port status return
        time.sleep(1)
        return 1

    def port_unlock_force(self):
        self.is_locked = 0
        # 20160804, stop all counter report
        self.read_counter_stop()

        self.is_stoptest = 1
        self.log_file.write(0, "(Socket1) CommandID = 0x001E(Port Unlock)")
        self.ns_cmd_header.command_id = 0x1e
        self.ns_cmd_header.sequence_num = self.sequence_num
        ns_chassID = 0xffff
        ns_boardID = 0xff
        ns_portID = 0xff
        ns_pwd = 0xffab1234
        ns_unlock = 0
        ns_reserved = [0xff] * 30
        self.ns_cmd_header.reserved[0] = 0
        self.ns_cmd_header.reserved[1] = 0
        if self.server_type == 1:
            lockcmd = struct.pack("!H2B12IH30B", ns_chassID, ns_boardID, ns_portID, self.server_chassis, self.map_lock[0], self.map_lock[1], self.map_lock[2], self.map_lock[3], self.map_lock[4], self.map_lock[5], self.map_lock[6], self.map_lock[7], self.map_lock[8], self.map_lock[9], ns_pwd, ns_unlock, *ns_reserved)
        elif self.server_type == 0:
            lockcmd = struct.pack("!H2B6IH30B", ns_chassID, ns_boardID, ns_portID, self.server_chassis, self.map_lock[0], self.map_lock[1], self.map_lock[2], self.map_lock[3], ns_pwd, ns_unlock, *ns_reserved)
        stream = self.ns_cmd_header.get_payload()+lockcmd
        self.config_ack(self.ns_cmd_header.command_id, -1)
        self.sendpkt_sock1(stream)
        time.sleep(1)
    def config_cmd_header(self, pidx, cmd_id, sub_cmd_id):
        if pidx >= 0:
            self.ns_cmd_header.command_id = cmd_id
            self.ns_cmd_header.sequence_num = self.sequence_num
            self.ns_cmd_header.card_type = self.ns_info_portlist[pidx].card_type
            self.ns_cmd_header.sub_command_id = sub_cmd_id
            self.ns_cmd_header.client_id = self.client_id
   
    def clear_counter_port(self, pidx):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x000D(Clear Port Counter)")
            # 全改成config_cmd_header形式            
            self.config_cmd_header(pidx, 0xd, 0)
            #self.ns_cmd_header.card_type = self.ns_info_portlist[pidx].card_type
            #self.ns_cmd_header.sequence_num = self.sequence_num
            #self.ns_cmd_header.command_id = 0xd
            #self.ns_cmd_header.sub_command_id = 0
            #self.ns_cmd_header.client_id = self.client_id
            
            payload = [0]*36
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+struct.pack("!HBB36B", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, *payload)
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)
            # 20170516, TK, added. Tell hte board starting to repor counter
            self.read_counter_port_start(pidx, 2)

    def clear_counter_stream(self, pidx):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x002f(Clear Stream Counter)")
            self.config_cmd_header(pidx, 0x2f, 0)
            payload = [0]*36
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+struct.pack("!HBB36B", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, *payload)
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)
            # 20260701, TK, added. Tell the board starting to repor counter
            self.read_counter_stream_start(pidx, 2)

    def read_info_board(self, pidx):
        if pidx >= 0:
            self.log_file.write(0, '(Socket1) CommandID = 0x0010(Boardstatus), Slot %d' % self.ns_info_portlist[pidx].board_id)
            self.config_cmd_header(pidx, 0x10, 0)
            payload = [0]*36
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+struct.pack("!HBB36B", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, *payload)
            #self.sendpkt_sock1(stream)
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            if python_ver == 2:
                thread.start_new_thread(self.sendpkt_sock1, (stream,))
            else:
                _thread.start_new_thread(self.sendpkt_sock1, (stream,))
            time.sleep(0.2)

    def read_license_board(self, pidx):
        if pidx >= 0:
            self.log_file.write(0, '(Socket1) CommandID = 0x00E0(EEPROM read), Slot %d' % self.ns_info_portlist[pidx].board_id)
            self.config_cmd_header(pidx, 0xe0, 0)
            payload = [0]*36
            # 4~19 is the map. 0~3 is reserved
            idx = 0
            while idx < 20:
                payload[idx] = 0xff
                idx += 1
            payload[20] = 0xff
            payload[21] = 0xee
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+struct.pack("!HBB36B", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, *payload)
            #self.sendpkt_sock1(stream)
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            if python_ver == 2:
                thread.start_new_thread(self.sendpkt_sock1, (stream,))
            else:
                _thread.start_new_thread(self.sendpkt_sock1, (stream,))
            time.sleep(0.5)
                
    def read_info_link(self, pidx):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x000F(Linkstatus)")
            self.config_cmd_header(pidx, 0xF, 0)
            payload = [0]*36
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+struct.pack("!HBB36B", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, *payload)
            #self.sendpkt_sock1(stream)
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            if python_ver == 2:
                thread.start_new_thread(self.sendpkt_sock1, (stream,))
            else:
                _thread.start_new_thread(self.sendpkt_sock1, (stream,))
            time.sleep(0.2)

    def read_counter_port_once(self, pidx):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x000C(Read Port Counter)")
            self.config_cmd_header(pidx, 0xc, 0)
            payload = [0]*36
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+struct.pack("!HBB36B", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, *payload)
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)
            #thread.start_new_thread(self.SendPackets, (stream,))

    # self loop to read port counter by interval time
    def read_counter_port_start(self, pidx, interval):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x000A(Start Read Port Counter)")
            #print >>sys.stderr, '(Send)(Socket1) CommandID = 0x000C(Read Port Counter)'
            self.config_cmd_header(pidx, 0xa, 0)
            payload = [0]*36
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+struct.pack("!HBBI36B", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, interval, *payload)
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)

    def read_counter_port_stop(self, pidx):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x000B(Stop Read Port Counter)")
            self.config_cmd_header(pidx, 0xb, 0)
            payload = [0]*36
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+struct.pack("!HBB36B", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, *payload)
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)
            
    # read stream counter once
    def read_counter_stream_once(self, pidx):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x002E(Read Stream Counter Report)")
            self.config_cmd_header(pidx, 0x2e, 0)
            payload = [0]*36
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+struct.pack("!HBB36B", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, *payload)
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)
            time.sleep(1)

    #start to read stream counter report by interval time
    def read_counter_stream_start(self, pidx, interval):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x002C(Start Stream Counter Report by interval)")
            self.config_cmd_header(pidx, 0x2c, 0)
            payload = [0]*36
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+struct.pack("!HBBI36B", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, interval, *payload)
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)
            
    def read_counter_stream_stop(self, pidx):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x002D(Stop Stream Counter Report by interval)")
            self.config_cmd_header(pidx, 0x2d, 0)
            payload = [0]*36
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+struct.pack("!HBB36B", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id,  *payload)
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)

    # for media config
    def config_media_speed(self, speed):
        if speed == ns_const.MEDIA_SPEED_10G:
            self.__media_speed = ns_const.MEDIA_SPEED_10G
        elif speed == ns_const.MEDIA_SPEED_2P5G:
            self.__media_speed = ns_const.MEDIA_SPEED_2P5G
        elif speed == ns_const.MEDIA_SPEED_5G:
            self.__media_speed = ns_const.MEDIA_SPEED_5G
        elif speed == ns_const.MEDIA_SPEED_1G:
            self.__media_speed = ns_const.MEDIA_SPEED_1G
        elif speed == ns_const.MEDIA_SPEED_100M:
            self.__media_speed = ns_const.MEDIA_SPEED_100M
        elif speed == ns_const.MEDIA_SPEED_10M:
            self.__media_speed = ns_const.MEDIA_SPEED_10M
        elif speed == ns_const.MEDIA_SPEED_LINKDOWN:
            self.__media_speed = ns_const.MEDIA_SPEED_LINKDOWN
        else:
            self.__media_speed = ns_const.MEDIA_SPEED_100M
    
    def config_media_duplex(self, duplex):
        if duplex == ns_const.MEDIA_DUPLEX_FULL:
            self.__media_duplex = ns_const.MEDIA_DUPLEX_FULL
        elif duplex == ns_const.MEDIA_DUPLEX_HALF:
            self.__media_duplex = ns_const.MEDIA_DUPLEX_HALF
        else:
            self.__media_duplex = ns_const.MEDIA_DUPLEX_FULL
    
    def config_media_nego(self, nego):
        if nego == ns_const.MEDIA_NEGO_AUTO:
            self.__media_nego = ns_const.MEDIA_NEGO_AUTO
        elif nego == ns_const.MEDIA_NEGO_FORCE:
            self.__media_nego = ns_const.MEDIA_NEGO_FORCE
        else:
            self.__media_nego = ns_const.MEDIA_NEGO_AUTO
    
    def config_media_signal(self, signal):
        if signal == ns_const.MEDIA_NEGO_AUTO:
            self.__media_signal = ns_const.MEDIA_SIGNAL_FIBER
        elif nego == ns_const.MEDIA_NEGO_FORCE:
            self.__media_signal = ns_const.MEDIA_SIGNAL_COPPER
        else:
            self.__media_signal = ns_const.MEDIA_SIGNAL_COPPER
        
    def config_media_mastermode(self, mode):
        if mode == ns_const.MEDIA_MASTERMODE_MASTER:
            self.__media_master_slave = ns_const.MEDIA_MASTERMODE_MASTER
        elif mode == ns_const.MEDIA_MASTERMODE_SLAVE:
            self.__media_master_slave = ns_const.MEDIA_MASTERMODE_SLAVE
        elif mode == ns_const.MEDIA_MASTERMODE_AUTO:
            self.__media_master_slave = ns_const.MEDIA_MASTERMODE_AUTO
        else:
            self.__media_master_slave = ns_const.MEDIA_MASTERMODE_AUTO



    def set_media(self, pidx):
        if pidx > -1:
            media_value = 0x7
            media_capability_bit = 0x3ff
            if self.__media_speed < ns_const.MEDIA_SPEED_1G:
                media_value = self.__media_nego*4 + self.__media_speed*2 + self.__media_duplex
            elif self.__media_speed == ns_const.MEDIA_SPEED_1G:
                media_value = 8 + self.__media_nego*2 + self.__media_duplex
            elif self.__media_speed == ns_const.MEDIA_SPEED_10G:
                media_value = 12 + self.__media_nego
            elif self.__media_speed == ns_const.MEDIA_SPEED_2P5G:
                media_value = 14 + self.__media_nego
            elif self.__media_speed == ns_const.MEDIA_SPEED_5G:
                media_value = 16 + self.__media_nego
            elif self.__media_speed == 0xff:
                media_value = self.__media_speed
            else:
                media_value = 7
            # if fiber or copper
            if self.__media_signal == ns_const.MEDIA_SIGNAL_FIBER:
                media_value = media_value | 0x8000
            # if force mode
            if self.__media_nego == 0:
                if self.__media_speed < 3:
                    media_capability_bit = self.__media_speed*2+self.__media_duplex
                else:
                    media_capability_bit = 6
            # media command
            self.log_file.write(0, "(Socket1) CommandID = 0x0002(Media Type Change)")
            self.config_cmd_header(pidx, 0x2, 0)
            self.ns_cmd_media.chassis_id = self.ns_info_portlist[pidx].chassis_id
            self.ns_cmd_media.board_id = self.ns_info_portlist[pidx].board_id
            self.ns_cmd_media.port_id = self.ns_info_portlist[pidx].port_id
            self.ns_cmd_media.media_type = media_value
            if self.__media_nego == 0:
                self.ns_cmd_media.capability = 2**media_capability_bit
            else:
                self.ns_cmd_media.capability = 0xffff
            self.ns_cmd_media.master_slave = self.__media_master_slave
            self.ns_cmd_media.my_chassis = 0
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+self.ns_cmd_media.get_payload()
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)

    # for tx config
    def set_config_tx(self, pidx):
        if pidx >= 0:
            # send a tx confg first
            self.log_file.write(0, "(Socket1) CommandID = 0x0003(Tx Config)")
            # tx config
            self.config_cmd_header(pidx, 0x3, 2)
            cfg_arr = [0xff]*90
            for i in range(6, 56):
                cfg_arr[i] = 0
            cfg_arr[0] = 0
            #20230816, TK, added
            #slot no.
            cfg_arr[4] = self.ns_info_portlist[pidx].board_id 
            #port no.
            cfg_arr[5] = self.ns_info_portlist[pidx].port_id
            #Clear X-TAG S/N
            cfg_arr[10] = 1
            #Clear X-TAG S/N First
            cfg_arr[11] = 1
            #Elongated Gap Control 1:-30ppm, 2:-15ppm
            cfg_arr[22] = 2
            #Max Random Packet Length
            cfg_arr[26] = 0x05
            cfg_arr[27] = 0xea
            #Min Random Packet Length
            cfg_arr[31] = 0x3c
            #Max Random loop count
            cfg_arr[34] = 0xff
            cfg_arr[35] = 0xff
            #Min Random loop count
            cfg_arr[39] = 0x1
            cfg_arr[88] = 0xff
            cfg_arr[89] = 0xee
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0x72
            stream_txcfg = struct.pack("!HBB90B", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, *cfg_arr)
            stream = self.ns_cmd_header.get_payload()+stream_txcfg
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)

    # for port config
    def set_config_port(self, pidx):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x0093(Port Config)")
            self.config_cmd_header(pidx, 0x93, 0)
            
            self.ns_cmd_portconfig.chassis_id = self.ns_info_portlist[pidx].chassis_id
            self.ns_cmd_portconfig.board_id = self.ns_info_portlist[pidx].board_id
            self.ns_cmd_portconfig.port_id = self.ns_info_portlist[pidx].port_id
            # 20220415, TK, added
            self.ns_cmd_portconfig.enable_txfc = self.portcfg_flowctrl_tx
            self.ns_cmd_portconfig.enable_rxfc = self.portcfg_flowctrl_rx
            # 20250327, TK, added. setting for x4S
            if (231 <= self.ns_info_portlist[pidx].card_type <= 233) or (241 <= self.ns_info_portlist[pidx].card_type <= 243):
                self.ns_cmd_portconfig.auto_mdix = 0x0000ffff
            else:
                self.ns_cmd_portconfig.auto_mdix = 0x00000001
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+self.ns_cmd_portconfig.get_payload()
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)

    # 20160923, TK, added. set rx stream config must be in front of start tx
    def set_config_rxstream(self, pidx):
        if pidx >= 0:
            self.is_stoptest = 0
                
            # send a rx stream config automatically
            self.log_file.write(0, "(Socket1) CommandID = 0x002b(Set Stream Counter)")
            self.config_cmd_header(pidx, 0x2b, 0)
            self.ns_cmd_rxstreamconfig.chassis_id = self.ns_info_portlist[pidx].chassis_id
            self.ns_cmd_rxstreamconfig.board_id = self.ns_info_portlist[pidx].board_id
            self.ns_cmd_rxstreamconfig.port_id = self.ns_info_portlist[pidx].port_id
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            stream = self.ns_cmd_header.get_payload()+self.ns_cmd_rxstreamconfig.get_payload()
            self.sendpkt_sock1(stream)
            # wait for ensure module setting
            time.sleep(0.7)
            # 20161124, TK, comment
            # 20161012, TK, added. start loop to read stream counter
            # thread.start_new_thread(self.read_counter_stream_loop, (pidx,))
            return 1
        else:
            return 0
    
    # For Addentry Entry

    # 20251028, new config setting
    # set tx rate control type, 0-auto, 1-manual
    def config_manual_txrate(self, val):
        self.manual_tx_rate = 1 if val > 1 else 0

    # 2026-07-15 修改:原版 vendor 程式碼把 val 夾在 max(val, 96),擋掉任何小於
    # 標準 96 bits 下限的封包間距。拿掉這個下限,讓 Forwarding Pressure 可以送
    # 真正小於 96 bits 間距的壓力封包(RFC-2889 的過載/壓力測試需要這個)。
    # 這是刻意、確認過安全的修改,只動這份複本——unpython/、unpython_RFC_2544/
    # 仍維持原本的下限保護。
    def config_stream_ibg(self, val):
        self.streamcfg.stream_ibg = val

    def config_stream_ifg(self, val):
        self.streamcfg.stream_ifg = val


    # set stream config, stream index start from 0
    def config_stream_streamnum(self, val):
        self.streamcfg.stream_number = val
        self.streamcfg.stream_beginidx = 0
        self.streamcfg.stream_endidx = val-1
    
    
    def config_stream_utilization(self, val):
        self.streamcfg.stream_utilization = min(val, 100)
        
    def config_stream_enable_randomlen(self, val):
        if val >= 1:
            self.streamcfg.stream_enablerand = 1
            self.streamcfg.stream_pktlen = 791
        else:
            self.streamcfg.stream_enablerand = val
    def config_stream_pktlen(self, val):
        self.streamcfg.stream_pktlen = max(40, min(val, 16000))
        
    #20231107, TK, added
    def config_stream_enable_xtag(self, val):
        self.streamcfg.stream_enableXtag = 1 if val >= 1 else val
        
    def config_stream_streamid(self, val):
        self.streamcfg.stream_id = max(1, min(val, 64))
        
    def config_stream_enable_vlan(self, val):
        self.streamcfg.stream_is_vlan = 1 if val > 1 else val
        
    def config_stream_vlan_id(self, val):
        self.streamcfg.stream_vlan_id = min(val, 4095)
        
    def config_stream_vlan_pri(self, val):
        self.streamcfg.stream_vlan_pri = min(val, 7)
        
    # MAC=xx:xx:xx:xx:xx:xx
    def get_stream_smac(self):
        return self.streamcfg.stream_smac
    def get_stream_dmac(self):
        return self.streamcfg.stream_dmac
    def config_stream_smac(self, val):
        self.streamcfg.stream_smac = [int(x,16) for x in val.split(':')]
    def config_stream_dmac(self, val):
        self.streamcfg.stream_dmac = [int(x,16) for x in val.split(':')]
    # IP=x.x.x.x
    def config_stream_sip(self, val):
        #self.streamcfg.stream_sip = map[int, val.split('.')]
        self.streamcfg.stream_sip = [int(x) for x in val.split('.')]
    def config_stream_dip(self, val):
        self.streamcfg.stream_dip = [int(x) for x in val.split('.')]
    def config_stream_sport(self, val):
        self.streamcfg.stream_sport = val
    def config_stream_dport(self, val):
        self.streamcfg.stream_dport = val
    #20161118, TK, added. For ARP Request
    def config_stream_arp_smac(self, val):
        self.streamcfg.stream_arp_smac = [int(x,16) for x in val.split(':')]
    def config_stream_arp_dmac(self, val):
        self.streamcfg.stream_arp_dmac = [int(x,16) for x in val.split(':')]
    def config_stream_arp_sip(self, val):
        self.streamcfg.stream_arp_sip = [int(x) for x in val.split('.')]
    def config_stream_arp_dip(self, val):
        self.streamcfg.stream_arp_dip = [int(x) for x in val.split('.')]
    #0-layer2, 1-layer3 ipv4, 2-layer3 udp, 3-layer3 ipv6, 4-ARP, 0xd-user define
    def config_stream_protocol(self, val):
        self.streamcfg.stream_protocol = val
    # 20170802, added
    def config_stream_udfpayload(self, pktlist):
        self.streamcfg.stream_payload = pktlist[:]

    # 20211207, added. for correct crc or error
    def config_stream_adderror(self, val):
        self.streamcfg.stream_error = val
    
    # 20220415, TK, added. for port config
    def config_port_flowctrl_tx(self, val):
        self.portcfg_flowctrl_tx = 1 if val >= 1 else val

    def config_port_flowctrl_rx(self, val):
        self.portcfg_flowctrl_rx = 1 if val >= 1 else val

    # 20260717, TK, added. for variable setting
    def config_stream_vary(
        self,
        da_mode=0,
        da_limit=2**8-1,
        da_delta=1,

        sa_mode=0,
        sa_limit=2**8-1,
        sa_delta=1,

        vid_mode=0,
        vid_limit=2**8-1,
        vid_delta=1,

        dip_mode=0,
        dip_limit=2**8-1,
        dip_delta=1,

        sip_mode=0,
        sip_limit=2**8-1,
        sip_delta=1
    ):
        """
        設定 Stream 欄位變化方式。

        vary_mode:
            0: Disabled
            1: Increase
            2: Decrease
            3: Random

        vary_limit:
            變化範圍或變化次數上限，預設為 255

        vary_delta:
            每次變化的間隔，預設為 1
        """

        mode_list = [da_mode, sa_mode, vid_mode, dip_mode, sip_mode]
        if any(mode not in (0, 1, 2, 3) for mode in mode_list):
            raise ValueError(
                "vary_mode 必須為 0、1、2、3："
                "0=Disabled, 1=Increase, 2=Decrease, 3=Random"
            )

        limit_list = [da_limit, sa_limit, vid_limit, dip_limit, sip_limit]
        if any(not (1 <= limit <= 255) for limit in limit_list):
            raise ValueError("vary_limit 必須介於 1~255")

        delta_list = [da_delta, sa_delta, vid_delta, dip_delta, sip_delta]
        if any(delta <= 0 for delta in delta_list):
            raise ValueError("vary_delta 必須大於 0")

        self.streamcfg.stream_vary_mode_da = da_mode
        self.streamcfg.stream_vary_limit_da = da_limit
        self.streamcfg.stream_vary_delta_da = da_delta

        self.streamcfg.stream_vary_mode_sa = sa_mode
        self.streamcfg.stream_vary_limit_sa = sa_limit
        self.streamcfg.stream_vary_delta_sa = sa_delta

        self.streamcfg.stream_vary_mode_vid = vid_mode
        self.streamcfg.stream_vary_limit_vid = vid_limit
        self.streamcfg.stream_vary_delta_vid = vid_delta

        self.streamcfg.stream_vary_mode_dip = dip_mode
        self.streamcfg.stream_vary_limit_dip = dip_limit
        self.streamcfg.stream_vary_delta_dip = dip_delta

        self.streamcfg.stream_vary_mode_sip = sip_mode
        self.streamcfg.stream_vary_limit_sip = sip_limit
        self.streamcfg.stream_vary_delta_sip = sip_delta

    def set_stream(self, pidx, sid):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x0003(Addentry)")
            #addentry
            self.config_cmd_header(pidx, 0x3, 1)
            self.ns_info_portlist[pidx].total_stream_num = self.streamcfg.stream_number
            self.ns_info_portlist[pidx].streams[sid].chassis_id = self.ns_info_portlist[pidx].chassis_id
            self.ns_info_portlist[pidx].streams[sid].board_id = self.ns_info_portlist[pidx].board_id
            self.ns_info_portlist[pidx].streams[sid].port_id = self.ns_info_portlist[pidx].port_id
            # auto setting stream id
            self.streamcfg.stream_id = sid+1
            # line speed 
            byte_per_sec = 1250000
            if (self.ns_info_portlist[pidx].media_speed == ns_const.MEDIA_SPEED_10G):
                byte_per_sec = 1250000000
            elif (self.ns_info_portlist[pidx].media_speed == ns_const.MEDIA_SPEED_5G):
                byte_per_sec = 625000000
            elif (self.ns_info_portlist[pidx].media_speed == ns_const.MEDIA_SPEED_2P5G):
                byte_per_sec = 312500000
            elif (self.ns_info_portlist[pidx].media_speed == ns_const.MEDIA_SPEED_1G):
                byte_per_sec = 125000000
            elif (self.ns_info_portlist[pidx].media_speed == ns_const.MEDIA_SPEED_100M):
                byte_per_sec = 12500000
            elif (self.ns_info_portlist[pidx].media_speed == ns_const.MEDIA_SPEED_10M):
                byte_per_sec = 1250000

            # 20250811, modified. all ports have own pps
            # calculate the total packets at 100%
            self.counter_per_sec[pidx] = byte_per_sec // (self.streamcfg.stream_pktlen+20)
            # 20170630, TK, modified. conver to int
            # calculate the real packets number according to the utilization
            self.counter_per_sec[pidx] = int((self.counter_per_sec[pidx] * self.streamcfg.stream_utilization) // 100)
            
            # '//' operator will return a positive interger
            # frame gap = frame length(include preamble and gap)- (framesize + preamble)
            # frame gap is a byte unit, translate to bit unit(*8)
            # 20170630, TK, modified. conver to int
            real_gap = int(((byte_per_sec // self.counter_per_sec[pidx]) - (self.streamcfg.stream_pktlen + 8))*8)

            if self.manual_tx_rate == 0:
                self.ns_info_portlist[pidx].streams[sid].interburst_gap = real_gap
                self.ns_info_portlist[pidx].streams[sid].frame_gap = real_gap
            else:
                self.ns_info_portlist[pidx].streams[sid].interburst_gap = self.streamcfg.stream_ibg
                self.ns_info_portlist[pidx].streams[sid].frame_gap = self.streamcfg.stream_ifg
            

            self.ns_info_portlist[pidx].streams[sid].random_len = self.streamcfg.stream_enablerand
            #20161003, TK, modified. minus the crc length
            #self.ns_info_portlist[pidx].streams[sid].packet_len = self.streamcfg.stream_pktlen
            self.ns_info_portlist[pidx].streams[sid].packet_len = self.streamcfg.stream_pktlen-4
            self.ns_info_portlist[pidx].streams[sid].stream_id = self.streamcfg.stream_id
            #20211207, added for append error
            self.ns_info_portlist[pidx].streams[sid].add_error_crc = self.streamcfg.stream_error

            #20231106, TK, added for XTAG enable
            self.ns_info_portlist[pidx].streams[sid].enable_Xtag = self.streamcfg.stream_enableXtag

            #20260717, TK, added. for variable setting
            self.ns_info_portlist[pidx].streams[sid].vary_mode_dip = self.streamcfg.stream_vary_mode_dip
            self.ns_info_portlist[pidx].streams[sid].vary_mode_sip = self.streamcfg.stream_vary_mode_sip
            self.ns_info_portlist[pidx].streams[sid].vary_mode_da = self.streamcfg.stream_vary_mode_da
            self.ns_info_portlist[pidx].streams[sid].vary_mode_sa = self.streamcfg.stream_vary_mode_sa
            self.ns_info_portlist[pidx].streams[sid].vary_mode_vid = self.streamcfg.stream_vary_mode_vid
            self.ns_info_portlist[pidx].streams[sid].vary_limit_dip = self.streamcfg.stream_vary_limit_dip
            self.ns_info_portlist[pidx].streams[sid].vary_limit_sip = self.streamcfg.stream_vary_limit_sip
            self.ns_info_portlist[pidx].streams[sid].vary_limit_da = self.streamcfg.stream_vary_limit_da
            self.ns_info_portlist[pidx].streams[sid].vary_limit_sa = self.streamcfg.stream_vary_limit_sa
            self.ns_info_portlist[pidx].streams[sid].vary_limit_vid = self.streamcfg.stream_vary_limit_vid
            self.ns_info_portlist[pidx].streams[sid].vary_delta_dip = self.streamcfg.stream_vary_delta_dip
            self.ns_info_portlist[pidx].streams[sid].vary_delta_sip = self.streamcfg.stream_vary_delta_sip
            self.ns_info_portlist[pidx].streams[sid].vary_delta_da = self.streamcfg.stream_vary_delta_da
            self.ns_info_portlist[pidx].streams[sid].vary_delta_sa = self.streamcfg.stream_vary_delta_sa
            self.ns_info_portlist[pidx].streams[sid].vary_delta_vid = self.streamcfg.stream_vary_delta_vid

            if self.streamcfg.stream_protocol == 0xd:
                self.ns_info_portlist[pidx].streams[sid].set_udf_payload(self.streamcfg.stream_payload)
            else:

                __tmp_pad_patn = [0]*1058
                #MAC
                tidx = 0
                for idx in range(6):
                    __tmp_pad_patn[idx] = self.streamcfg.stream_dmac[idx]
                    __tmp_pad_patn[idx+6] = self.streamcfg.stream_smac[idx]
                tidx += 12
                if self.streamcfg.stream_is_vlan == 1:
                    __tmp_pad_patn[tidx] = 0x81
                    __tmp_pad_patn[tidx+1] = 0x00
                    __tmp_pad_patn[tidx+2] = int(self.streamcfg.stream_vlan_pri*32)
                    __tmp_pad_patn[tidx+2] += int(self.streamcfg.stream_vlan_id / 256)
                    __tmp_pad_patn[tidx+3] = self.streamcfg.stream_vlan_id & 0xff
                    tidx += 4
                if self.streamcfg.stream_protocol == 0:
                    __tmp_pad_patn[tidx] = 0xff
                    __tmp_pad_patn[tidx+1] = 0xff
                    tidx += 2
                # protocol = 4 means ARP
                elif self.streamcfg.stream_protocol == 4:
                    __tmp_pad_patn[tidx] = 0x08
                    __tmp_pad_patn[tidx+1] = 0x06
                    __tmp_pad_patn[tidx+2] = 0x00
                    __tmp_pad_patn[tidx+3] = 0x01
                    __tmp_pad_patn[tidx+4] = 0x08
                    __tmp_pad_patn[tidx+5] = 0x00
                    __tmp_pad_patn[tidx+6] = 0x06
                    __tmp_pad_patn[tidx+7] = 0x04
                    __tmp_pad_patn[tidx+8] = 0x00
                    __tmp_pad_patn[tidx+9] = 0x01
                    tidx += 10
                    for idx in range(6):
                        __tmp_pad_patn[tidx+idx] = self.streamcfg.stream_arp_smac[idx]
                        __tmp_pad_patn[tidx+10+idx] = self.streamcfg.stream_arp_dmac[idx]
                    tidx += 6
                    for idx in range(4):
                        __tmp_pad_patn[tidx+idx] = self.streamcfg.stream_arp_sip[idx]& 0xff
                        __tmp_pad_patn[tidx+10+idx] = self.streamcfg.stream_arp_dip[idx]& 0xff
                    tidx += 14
                # protocol = 1 means ip, protocol = 2 means udp
                elif self.streamcfg.stream_protocol == 1 or self.streamcfg.stream_protocol == 2:
                    __tmp_pad_patn[tidx] = 0x08
                    __tmp_pad_patn[tidx+1] = 0x00
                    tidx += 2
                    # start IP header
                    ipheader = [0]*20
                    # version+length
                    ipheader[0] = 0x45
                    # Type of Service
                    ipheader[1] = 0x00

                    # total length (without MAC and Type)
                    hdrlen = 0
                    if self.streamcfg.stream_is_vlan == 1:
                        hdrlen = (self.streamcfg.stream_pktlen-4)-18
                    else:
                        hdrlen = (self.streamcfg.stream_pktlen-4)-14
                    ipheader[2] = int(hdrlen / 256) & 0xff
                    ipheader[3] = hdrlen & 0xff
                    # id - using outside id
                    ipheader[4] = int(self.sequence_num / 256) & 0xff
                    ipheader[5] = self.sequence_num & 0xff
                    # fragment - no fragment
                    ipheader[6] = 0x40
                    ipheader[7] = 0x00
                    #TTL = 128
                    ipheader[8] = 0x80
                    #protocol
                    if self.streamcfg.stream_protocol == 2:
                        ipheader[9] = 0x11
                    else:
                        ipheader[9] = 0xff
                    #checksum
                    ipheader[10] = 0
                    ipheader[11] = 0
                    #sip, dip
                    for idx in range(4):
                        ipheader[12+idx] = self.streamcfg.stream_sip[idx]& 0xff
                        ipheader[16+idx] = self.streamcfg.stream_dip[idx]& 0xff
                    #calculate checksum
                    checksum = self.ip_checksum(ipheader, len(ipheader))
                    ipheader[10] = int(checksum / 256) & 0xff
                    ipheader[11] = checksum & 0xff
                    #restore to __tmp_pad_patn
                    for ipidx in range(20):
                        __tmp_pad_patn[tidx+ipidx] = ipheader[ipidx]& 0xff
                    tidx += 20
                    # udp header
                    if self.streamcfg.stream_protocol == 2:
                        # for psedo header
                        udpheader = [0]*20
                        # udp protocol
                        udpheader[9] = 17
                        #source port
                        __tmp_pad_patn[tidx] = int(self.streamcfg.stream_sport / 256) & 0xff
                        __tmp_pad_patn[tidx+1] = self.streamcfg.stream_sport & 0xff
                        udpheader[12] = int(self.streamcfg.stream_sport / 256) & 0xff
                        udpheader[13] = self.streamcfg.stream_sport & 0xff
                        tidx += 2
                        #dest port
                        __tmp_pad_patn[tidx] = int(self.streamcfg.stream_dport / 256) & 0xff
                        __tmp_pad_patn[tidx+1] = self.streamcfg.stream_dport & 0xff
                        udpheader[14] = int(self.streamcfg.stream_dport / 256) & 0xff
                        udpheader[15] = self.streamcfg.stream_dport & 0xff
                        tidx += 2
                        #length
                        hdrlen -= 20
                        __tmp_pad_patn[tidx] = int(hdrlen / 256) & 0xff
                        __tmp_pad_patn[tidx+1] = hdrlen & 0xff
                        udpheader[10] = int(hdrlen / 256) & 0xff
                        udpheader[11] = hdrlen & 0xff
                        udpheader[16] = int(hdrlen / 256) & 0xff
                        udpheader[17] = hdrlen & 0xff
                        tidx += 2
                        #checksum
                        for idx in range(4):
                            udpheader[0+idx] = self.streamcfg.stream_sip[idx]& 0xff
                            udpheader[4+idx] = self.streamcfg.stream_dip[idx]& 0xff
                        checksum = self.ip_checksum(udpheader, len(udpheader))
                        __tmp_pad_patn[tidx] = (checksum / 256)&0xff
                        __tmp_pad_patn[tidx+1] = checksum & 0xff
                        tidx += 2
                # 添加payload
				
                for payloadidx in range(len(self.streamcfg.stream_payload)):
                    if payloadidx < 1058-tidx:
                        __tmp_pad_patn[tidx+payloadidx] = self.streamcfg.stream_payload[payloadidx]
                self.ns_info_portlist[pidx].streams[sid].set_udf_payload(__tmp_pad_patn)

            # auto assign entry index and next entry index
            self.ns_info_portlist[pidx].streams[sid].entry_index = sid
            if sid < self.streamcfg.stream_number-1:
                self.ns_info_portlist[pidx].streams[sid].next_index = sid+1
            elif sid == self.streamcfg.stream_number-1:
                self.ns_info_portlist[pidx].streams[sid].next_index = 0
            else:
                self.ns_info_portlist[pidx].streams[sid].next_index = 0
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.ns_cmd_header.reserved[0] = 0x4
            self.ns_cmd_header.reserved[1] = 0xA2
            stream = self.ns_cmd_header.get_payload()+self.ns_info_portlist[pidx].streams[sid].get_payload()
            self.sendpkt_sock1(stream)

            self.set_config_tx(pidx)    
    #20250811, modified. using port index
    def config_tx_txtime(self, pidx, val):
        self.ns_cmd_starttx.total_pkts[pidx] = self.counter_per_sec[pidx] * val
    def config_tx_txpkts(self, pidx, val):
        self.ns_cmd_starttx.total_pkts[pidx] = val
    def config_tx_isimmediate(self, val):
        self.ns_cmd_starttx.immediate_tx = val

    
    # 1 means transmit immediatly, 0 means wait for a global transmit command
    def transmit_pkts(self, pidx):
        if pidx >= 0:
            self.is_stoptest = 0
            
            #clear port/stream counter
            #self.clear_counter_port(pidx)
            #self.clear_counter_stream(pidx)
            
            # 20161012, TK, modified. write to function and call it
            #self.set_config_tx(pidx)

            # 20161012, TK, added. å ä¸port config
            self.set_config_port(pidx)

            # 20161012, TK, comment. SetStreamCounter must be early than start tx setting           
            # 20161124, TK, comment. 
            # start to read stream counter auto
            #self.read_counter_stream_start(pidx, 2)

            # 20161017, TK, added. Tell hte board starting to repor counter
            #self.read_counter_port_start(pidx, 2)

            # start tx command
            self.log_file.write(0, "(Socket1) CommandID = 0x0004(Start Transmit)")
            self.config_cmd_header(pidx, 0x4, 0)
            self.ns_cmd_starttx.chassis_id = self.ns_info_portlist[pidx].chassis_id
            self.ns_cmd_starttx.board_id = self.ns_info_portlist[pidx].board_id
            self.ns_cmd_starttx.port_id = self.ns_info_portlist[pidx].port_id
            self.ns_cmd_starttx.entryidx_begin = self.streamcfg.stream_beginidx
            self.ns_cmd_starttx.entryidx_end = self.streamcfg.stream_endidx
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+self.ns_cmd_starttx.get_payload(pidx)
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)
            
            # 20231106, TK, reopen. modified for NS900. there are 4 maps, slot 5/6 are reserved
            # save global command report map
            if self.server_type == 1: # 900 server
                if self.ns_info_portlist[pidx].board_id < 5:
                    self.ns_cmd_globaltx.global_map_1 = self.ns_cmd_globaltx.global_map_1 | (1<<((self.ns_info_portlist[pidx].board_id-1)*8+(self.ns_info_portlist[pidx].port_id-1)))
                elif self.ns_info_portlist[pidx].board_id >= 5 and self.ns_info_portlist[pidx].board_id < 9:
                    self.ns_cmd_globaltx.global_map_2 = self.ns_cmd_globaltx.global_map_2 | (1<<((self.ns_info_portlist[pidx].board_id-5)*8+(self.ns_info_portlist[pidx].port_id-1)))
                elif self.ns_info_portlist[pidx].board_id >= 9 and self.ns_info_portlist[pidx].board_id < 13:
                    self.ns_cmd_globaltx.global_map_3 = self.ns_cmd_globaltx.global_map_3 | (1<<((self.ns_info_portlist[pidx].board_id-9)*8+(self.ns_info_portlist[pidx].port_id-1)))
                else:
                    self.ns_cmd_globaltx.global_map_4 = self.ns_cmd_globaltx.global_map_4 | (1<<((self.ns_info_portlist[pidx].board_id-13)*8+(self.ns_info_portlist[pidx].port_id-1)))

            elif self.server_type == 0:
                self.ns_cmd_globaltx.global_map_1 = self.ns_cmd_globaltx.global_map_1 | (1<<((self.ns_info_portlist[pidx].board_id-2)*4+(self.ns_info_portlist[pidx].port_id-1)))
            return 1
        else:
            return 0

    def transmit_pkts_stop(self, pidx):
        if pidx >= 0:
            # start tx command
            self.log_file.write(0, "(Socket1) CommandID = 0x0005(Stop Transmit)")
            self.config_cmd_header(pidx, 0x5, 0)
            self.ns_cmd_simple.chassis_id = self.ns_info_portlist[pidx].chassis_id
            self.ns_cmd_simple.board_id = self.ns_info_portlist[pidx].board_id
            self.ns_cmd_simple.port_id = self.ns_info_portlist[pidx].port_id
            self.ns_cmd_simple.my_id = self.ns_cmd_simple.chassis_id
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+self.ns_cmd_simple.get_payload()
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)
         
    #20160923, TK, added. Global command
    def transmit_pkts_sync(self):
        self.is_stoptest = 0
            
        # send a rx stream config automatically
        self.log_file.write(0, "(Socket1) CommandID = 0x00a1(Global Start Tx)")
        self.ns_cmd_header.command_id = 0xa1
        self.ns_cmd_header.sequence_num = self.sequence_num
        self.ns_cmd_header.sub_command_id = 1
        self.ns_cmd_header.client_id = self.client_id
        tpidx = 0
        # module type = 0 - NuStreams-600i/700, =1 - NuStreams 2000i,900i
        if self.server_type == 1:
            self.ns_cmd_globaltx.module_type = 1
        
        for tpidx in range(self.total_port_num):
            if self.ns_info_portlist[tpidx].board_id == self.server_slot:
                break

        self.ns_cmd_header.card_type = self.ns_info_portlist[tpidx].card_type
        self.ns_cmd_globaltx.chassis_id = self.ns_info_portlist[tpidx].chassis_id
        self.ns_cmd_globaltx.board_id = self.ns_info_portlist[tpidx].board_id
        self.ns_cmd_globaltx.port_id = self.ns_info_portlist[tpidx].port_id
        self.ns_cmd_globaltx.chassis_cmd = self.ns_cmd_globaltx.chassis_id
        self.ns_cmd_header.reserved[0] = 0
        self.ns_cmd_header.reserved[1] = 0
        self.config_ack(self.ns_cmd_header.command_id, tpidx)
        stream = self.ns_cmd_header.get_payload()+self.ns_cmd_globaltx.get_payload()
        self.sendpkt_sock1(stream)
        return 1
    
    def transmit_pkts_sync_stop(self):
        self.is_stoptest = 0
            
        # send a rx stream config automatically
        self.log_file.write(0, "(Socket1) CommandID = 0x00a1(Global Stop Tx)")
        self.ns_cmd_header.command_id = 0xa1
        self.ns_cmd_header.sequence_num = self.sequence_num
        self.ns_cmd_header.sub_command_id = 2
        self.ns_cmd_header.client_id = self.client_id
        tpidx = 0
        # module type = 0 - NuStreams-600i/700, =1 - NuStreams 2000i,900i
        if self.server_type == 1:
            self.ns_cmd_globaltx.module_type = 1
        
        for tpidx in range(self.total_port_num):
            if self.ns_info_portlist[tpidx].board_id == self.server_slot:
                break

        self.ns_cmd_header.card_type = self.ns_info_portlist[tpidx].card_type
        self.ns_cmd_globaltx.chassis_id = self.ns_info_portlist[tpidx].chassis_id
        self.ns_cmd_globaltx.board_id = self.ns_info_portlist[tpidx].board_id
        self.ns_cmd_globaltx.port_id = self.ns_info_portlist[tpidx].port_id
        self.ns_cmd_globaltx.chassis_cmd = self.ns_cmd_globaltx.chassis_id
        self.ns_cmd_header.reserved[0] = 0
        self.ns_cmd_header.reserved[1] = 0
        self.config_ack(self.ns_cmd_header.command_id, tpidx)
        stream = self.ns_cmd_header.get_payload()+self.ns_cmd_globaltx.get_payload()
        self.sendpkt_sock1(stream)
        return 1

    def config_and_runtest(self, relation, learning, duration, framesize, loading):
        result = True
        for ridx in range(len(relation)):
            print("port %d -> port %d, now size = %d, now load = %f" %(relation[ridx].idx_source, relation[ridx].idx_dest, framesize, loading))
        return result

    # 20170725, TK, added. ping function
    def config_ping_num_ping(self, num):
        self.ns_cmd_pingv4.num_ping = min(max(num, 0), 255)
        self.ns_cmd_pingv6.num_ping = min(max(num, 0), 255)
    def config_ping_num_arp(self, num):
        self.ns_cmd_pingv4.num_arp = min(max(num, 0), 255)
        self.ns_cmd_pingv6.num_ndp = min(max(num, 0), 255)
    def config_ping_num_ndp(self, num):
        self.ns_cmd_pingv6.num_ndp2 = min(max(num, 0), 255)
    def config_ping_sip(self, val):
        self.ns_cmd_pingv4.ip_src = [int(x) for x in val.split('.')]
    def config_ping_dip(self, val):
        self.ns_cmd_pingv4.ip_dest = [int(x) for x in val.split('.')]
    def config_ping_gip(self, val):
        self.ns_cmd_pingv4.ip_gateway = [int(x) for x in val.split('.')]
    def config_ping_smac(self, val):
        self.ns_cmd_pingv4.mymac = [int(x,16) for x in val.split(':')]
        self.ns_cmd_pingv6.mymac = [int(x,16) for x in val.split(':')]
    def config_ping_sipv6(self, val):
        ipv6tmp = [int(x) for x in val.split(':')]
        for idx in range(8):
            self.ns_cmd_pingv6.ip_src[idx*2] = ipv6tmp[idx]&0x00ff
            self.ns_cmd_pingv6.ip_src[idx*2+1] = (ipv6tmp[idx]&0xff00)/256
    def config_ping_dipv6(self, val):
        ipv6tmp = [int(x) for x in val.split(':')]
        for idx in range(8):
            self.ns_cmd_pingv6.ip_dest[idx*2] = ipv6tmp[idx]&0x00ff
            self.ns_cmd_pingv6.ip_dest[idx*2+1] = (ipv6tmp[idx]&0xff00)/256
    def config_ping_gipv6(self, val):
        ipv6tmp = [int(x) for x in val.split(':')]
        for idx in range(8):
            self.ns_cmd_pingv6.ip_gateway[idx*2] = ipv6tmp[idx]&0x00ff
            self.ns_cmd_pingv6.ip_gateway[idx*2+1] = (ipv6tmp[idx]&0xff00)/256
    def pingv4_send(self, pidx):
        if pidx >= 0:
            
            # set rx xtrailer - 攸關ping成功與否關鍵
            '''
            self.log_file.write(0, "(Socket1) CommandID = 0x001a(Rx Xtrail)") 
            self.config_cmd_header(pidx, 0x1a, 0)
            self.ns_cmd_simple.chassis_id = self.ns_info_portlist[pidx].chassis_id
            self.ns_cmd_simple.board_id = self.ns_info_portlist[pidx].board_id
            self.ns_cmd_simple.port_id = self.ns_info_portlist[pidx].port_id
            stream = self.ns_cmd_header.get_payload()+self.ns_cmd_simple.get_payload()
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)
            time.sleep(0.15)
            '''

            # step 1 - start arp
            self.ns_cmd_arpreply.arpnode[0].configbit = 0x801
            for idx in range(6):
                self.ns_cmd_arpreply.arpnode[0].mymac[idx] = self.ns_cmd_pingv4.mymac[idx]
            for idx in range(4):
                self.ns_cmd_arpreply.arpnode[0].ip_src[idx] = self.ns_cmd_pingv4.ip_src[idx]
                self.ns_cmd_arpreply.arpnode[0].ip_gateway[idx] = self.ns_cmd_pingv4.ip_gateway[idx]
            self.arp_reply_start(pidx)

            # step 2 - ping
            self.ns_info_portlist[pidx].is_ping_success = 0
            self.log_file.write(0, "(Socket1) CommandID = 0x0014(Ping v4)") 
            self.config_cmd_header(pidx, 0x14, 0)
            self.ns_cmd_pingv4.chassis_id = self.ns_info_portlist[pidx].chassis_id
            self.ns_cmd_pingv4.board_id = self.ns_info_portlist[pidx].board_id
            self.ns_cmd_pingv4.port_id = self.ns_info_portlist[pidx].port_id
            stream = self.ns_cmd_header.get_payload()+self.ns_cmd_pingv4.get_payload()
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)
            

            '''
            # step 1 - send an ARP Request packet
            
            self.log_file.write(0, "(Socket1) CommandID = 0x0028(NIC set)") 
            self.config_cmd_header(pidx, 0x28, 1)
            self.ns_cmd_nicset.chassis_id = self.ns_info_portlist[pidx].chassis_id
            self.ns_cmd_nicset.board_id = self.ns_info_portlist[pidx].board_id
            self.ns_cmd_nicset.port_id = self.ns_info_portlist[pidx].port_id
            #for idx in range(6):
             #   self.ns_cmd_nicset.mac_low[idx] = self.ns_cmd_pingv4.mymac[idx]
              #  self.ns_cmd_nicset.mac_high[idx] = self.ns_cmd_pingv4.mymac[idx]
            self.ns_cmd_nicset.mac_low[0] = 0
            self.ns_cmd_nicset.mac_high[0] = 0
            self.ns_cmd_nicset.mac_low[1] = 0x22
            self.ns_cmd_nicset.mac_high[1] = 0x22
            self.ns_cmd_nicset.mac_low[2] = 0xa2
            self.ns_cmd_nicset.mac_high[2] = 0xa2
            self.ns_cmd_nicset.mac_low[3] = 0
            self.ns_cmd_nicset.mac_high[3] = 0xff
            self.ns_cmd_nicset.mac_low[4] = 0
            self.ns_cmd_nicset.mac_high[4] = 0xff
            self.ns_cmd_nicset.mac_low[5] = 0
            self.ns_cmd_nicset.mac_high[5] = 0xff

                
            stream = self.ns_cmd_header.get_payload()+self.ns_cmd_nicset.get_payload()
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)

            self.log_file.write(0, "(Socket1) CommandID = 0x0028(NIC send)") 
            self.config_cmd_header(pidx, 0x28, 2)
            self.ns_cmd_nicsend.chassis_id = self.ns_info_portlist[pidx].chassis_id
            self.ns_cmd_nicsend.board_id = self.ns_info_portlist[pidx].board_id
            self.ns_cmd_nicsend.port_id = self.ns_info_portlist[pidx].port_id
            # DA/SA
            tidx = 6
            for idx in range(6):
                self.ns_cmd_nicsend.pktdata[idx] = 0xff
                self.ns_cmd_nicsend.pktdata[tidx+idx] = self.ns_cmd_pingv4.mymac[idx]
                tidx=12
            self.ns_cmd_nicsend.pktdata[tidx] = 0x8
            self.ns_cmd_nicsend.pktdata[tidx+1] = 0x6
            tidx = tidx+2
            self.ns_cmd_nicsend.pktdata[tidx] = 0x0
            self.ns_cmd_nicsend.pktdata[tidx+1] = 0x1 # ether type
            tidx = tidx+2
            self.ns_cmd_nicsend.pktdata[tidx] = 0x8 # for IP
            self.ns_cmd_nicsend.pktdata[tidx+1] = 0x0
            tidx = tidx+2
            self.ns_cmd_nicsend.pktdata[tidx] = 0x6
            self.ns_cmd_nicsend.pktdata[tidx+1] = 0x4
            tidx = tidx+2
            self.ns_cmd_nicsend.pktdata[tidx] = 0x0
            self.ns_cmd_nicsend.pktdata[tidx+1] = 0x1 # arp request
            tidx = tidx+2
            for idx in range(6):
                self.ns_cmd_nicsend.pktdata[tidx+idx] = self.ns_cmd_pingv4.mymac[idx]
            tidx = tidx+6
            for idx in range(4):
                self.ns_cmd_nicsend.pktdata[tidx+idx] = self.ns_cmd_pingv4.ip_src[idx]
            tidx = tidx+4
            for idx in range(6):
                self.ns_cmd_nicsend.pktdata[tidx+idx] = 0
            tidx = tidx+6
            for idx in range(4):
                self.ns_cmd_nicsend.pktdata[tidx+idx] = self.ns_cmd_pingv4.ip_dest[idx]
            stream = self.ns_cmd_header.get_payload()+self.ns_cmd_nicsend.get_payload()
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)
            '''


    def pingv6_send(self, pidx):
        if pidx >= 0:
            # step 1 - start arp
            self.ns_cmd_arpreply.arpnode[0].configbit = 0x801
            for idx in range(6):
                self.ns_cmd_arpreply.arpnode[0].mymac[idx] = self.ns_cmd_pingv6.mymac[idx]
            for idx in range(8):
                self.ns_cmd_arpreply.arpnode[0].ipv6_src[idx] = self.ns_cmd_pingv6.ip_src[idx]
                self.ns_cmd_arpreply.arpnode[0].ipv6_gateway[idx] = self.ns_cmd_pingv6.ip_gateway[idx]
            self.arp_reply_start(pidx)

            # step 2 - ping
            self.ns_info_portlist[pidx].is_ping_success = 0
            self.log_file.write(0, "(Socket1) CommandID = 0x0014(Ping v6)") 
            self.config_cmd_header(pidx, 0x14, 3)
            self.ns_cmd_pingv6.chassis_id = self.ns_info_portlist[pidx].chassis_id
            self.ns_cmd_pingv6.board_id = self.ns_info_portlist[pidx].board_id
            self.ns_cmd_pingv6.port_id = self.ns_info_portlist[pidx].port_id
            stream = self.ns_cmd_header.get_payload()+self.ns_cmd_pingv6.get_payload()
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)

    def config_arp_enablenode(self, nodeidx, enable):
        if nodeidx >= 0 and nodeidx <= 23:
            if enable == True:
                self.ns_cmd_arpreply.arpnode[nodeidx].configbit = 0x801
            else:
                self.ns_cmd_arpreply.arpnode[nodeidx].configbit = 0x800
    def config_arp_mac(self, nodeidx, val):
        if nodeidx >= 0 and nodeidx <= 23:
            self.ns_cmd_arpreply.arpnode[nodeidx].mymac = [int(x,16) for x in val.split(':')]
    def config_arp_vlan(self, nodeidx, val):
        if nodeidx >= 0 and nodeidx <= 23:
            self.ns_cmd_arpreply.arpnode[nodeidx].vlan = val
    def config_arp_ipv4(self, nodeidx, val):
        if nodeidx >= 0 and nodeidx <= 23:
            self.ns_cmd_arpreply.arpnode[nodeidx].ip_src = [int(x) for x in val.split('.')]
    def config_arp_gateway(self, nodeidx, val):
        if nodeidx >= 0 and nodeidx <= 23:
            self.ns_cmd_arpreply.arpnode[nodeidx].ip_gateway = [int(x) for x in val.split('.')]
    def config_arp_ipv6(self, nodeidx, val):
        if nodeidx >= 0 and nodeidx <= 23:
            ipv6tmp = [int(x) for x in val.split(':')]
            for idx in range(8):
                self.ns_cmd_arpreply.arpnode[nodeidx].ipv6_src[idx*2] = ipv6tmp[idx]&0x00ff
                self.ns_cmd_arpreply.arpnode[nodeidx].ipv6_src[idx*2+1] = (ipv6tmp[idx]&0xff00)/256
    def config_arp_gatewayv6(self, nodeidx, val):
        if nodeidx >= 0 and nodeidx <= 23:
            ipv6tmp = [int(x) for x in val.split(':')]
            for idx in range(8):
                self.ns_cmd_arpreply.arpnode[nodeidx].ipv6_gateway[idx*2] = ipv6tmp[idx]&0x00ff
                self.ns_cmd_arpreply.arpnode[nodeidx].ipv6_gateway[idx*2+1] = (ipv6tmp[idx]&0xff00)/256
    def arp_reply_start(self, pidx):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x0021(Start ARP Reply)") 
            self.config_cmd_header(pidx, 0x21, 0)
            self.ns_cmd_arpreply.chassis_id = self.ns_info_portlist[pidx].chassis_id
            self.ns_cmd_arpreply.board_id = self.ns_info_portlist[pidx].board_id
            self.ns_cmd_arpreply.port_id = self.ns_info_portlist[pidx].port_id
            stream = self.ns_cmd_header.get_payload()+self.ns_cmd_arpreply.get_payload()
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)
    def arp_reply_stop(self, pidx):
        if pidx >= 0:
            # start tx command
            self.log_file.write(0, "(Socket1) CommandID = 0x0022(Stop ARP Reply)")
            self.config_cmd_header(pidx, 0x22, 0)
            self.ns_cmd_simple.chassis_id = self.ns_info_portlist[pidx].chassis_id
            self.ns_cmd_simple.board_id = self.ns_info_portlist[pidx].board_id
            self.ns_cmd_simple.port_id = self.ns_info_portlist[pidx].port_id
            self.ns_cmd_simple.my_id = 0xffee
            stream = self.ns_cmd_header.get_payload()+self.ns_cmd_simple.get_payload()
            ns_reserved = [0] * 30
            # using socket1 to transmit the module card command
            stream2 = struct.pack("!30B", *ns_reserved)
            stream = stream + stream2
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)

    def config_dhcp_mac(self, val):
        self.ns_cmd_dhcpcfg.mymac = [int(x,16) for x in val.split(':')]

    def dhcp_set(self, pidx):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x0097(DHCP Config.)") 
            self.config_cmd_header(pidx, 0x97, 1)
            self.ns_cmd_dhcpcfg.chassis_id = self.ns_info_portlist[pidx].chassis_id
            self.ns_cmd_dhcpcfg.board_id = self.ns_info_portlist[pidx].board_id
            self.ns_cmd_dhcpcfg.port_id = self.ns_info_portlist[pidx].port_id
            stream = self.ns_cmd_header.get_payload()+self.ns_cmd_dhcpcfg.get_payload()
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)
    def dhcp_discovery(self, pidx):
        if pidx >= 0:
            # step 1 - start arp
            self.ns_cmd_arpreply.arpnode[0].configbit = 0x801
            for idx in range(6):
                self.ns_cmd_arpreply.arpnode[0].mymac[idx] = self.ns_cmd_dhcpcfg.mymac[idx]
            self.arp_reply_start(pidx)

            self.log_file.write(0, "(Socket1) CommandID = 0x0097(DHCP Discovery)") 
            self.config_cmd_header(pidx, 0x97, 2)
            # retry times = 1
            stream = struct.pack("!H2B2I", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, 1, 1)
            stream = self.ns_cmd_header.get_payload()+stream
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)

    def loopback_stop(self, pidx):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x001F(Loopback Disable)") 
            self.config_cmd_header(pidx, 0x1f, 0)
            # loopback mode
            mode = 0
            stream = struct.pack("!H2B2BH", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, mode, 0, 0xffee)
            stream = self.ns_cmd_header.get_payload()+stream
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)

    def loopback_layer1(self, pidx):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x001F(Loopback Layer1)") 
            self.config_cmd_header(pidx, 0x1f, 0)
            # loopback mode
            mode = 1
            stream = struct.pack("!H2B2BH", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, mode, 1, 0xffee)
            stream = self.ns_cmd_header.get_payload()+stream
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)

    def loopback_layer2(self, pidx):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x001F(Loopback Layer2)") 
            self.config_cmd_header(pidx, 0x1f, 0)
            # loopback mode
            mode = 7
            stream = struct.pack("!H2B2H", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, mode, 0xffee)
            stream = self.ns_cmd_header.get_payload()+stream
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)

    def capture_frames_start(self, pidx, capture_type):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x0008(Start Capture)") 
            type_jumbo = capture_type & ns_const.CAPTURE_JUMBO
            type_map2 = capture_type & ns_const.CAPTURE_ALL
            if(type_jumbo > 0):
                capture_type -= ns_const.CAPTURE_JUMBO
            if(type_map2 > 0):
                capture_type -= ns_const.CAPTURE_ALL
            type_map3 = capture_type
            self.config_cmd_header(pidx, 0x8, 0)
            # d = double, 8 bytes. q = long long, Q = unsigned long long, but q and Q is useful only on 64 bit PC
            # 16d = 128 bytes with SDFR setting, 2d = 16 bytes with SDFR enable, 4 bytes with MAP2, 4 bytes with MAP3, 4 bytes with langth capture_frames_start, 
            # 2 bytes with direct report(set enable), 2 bytes with jumbo packet
            # 16d2d3IHH
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+struct.pack("!HBB18Q3I2H", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, 
                                                                  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, type_map2, type_map3, 0, 1, type_jumbo)
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.is_stopcapture = 0
            self.sendpkt_sock1(stream)  
            ns_pktdb.clear_packet(pidx)

    def capture_frames_stop(self, pidx, capture_num):
        if pidx >= 0:
            self.is_stopcapture = 0
            self.log_file.write(0, "(Socket1) CommandID = 0x0009(Stop Capture)")
            self.config_cmd_header(pidx, 0x9, 0)
            payload = [0]*36
            stream = self.ns_cmd_header.get_payload()+struct.pack("!HBB36B", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, *payload)
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)

            self.ns_cmd_header.sub_command_id = 1
            self.ns_cmd_header.client_id = self.client_id
            payload = [0]*32
            self.ns_cmd_header.reserved[0] = 0
            self.ns_cmd_header.reserved[1] = 0
            stream = self.ns_cmd_header.get_payload()+struct.pack("!HBBI32B", self.ns_info_portlist[pidx].chassis_id, self.ns_info_portlist[pidx].board_id, self.ns_info_portlist[pidx].port_id, capture_num, *payload)
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)
            self.is_stopcapture = 1
            ns_pktdb.analysis_packet(pidx)
    
    def show_packet_content(self, pidx, pktidx):
        if pidx >= 0:
            ns_pktdb.show_packet_content(pidx, pktidx)
    
    def show_packet_info(self, pidx, pktidx):
        if pidx >= 0:
            ns_pktdb.show_packet_info(pidx, pktidx)

    # rx_mode0 = 0, disable。=1, enable by capture report。=2, enable by direct
    def config_nic_rxmode(self, val):
        if val > 0 and val < 3:
            self.ns_cmd_nicset.rx_mode0 = val
        else:
            self.ns_cmd_nicset.rx_mode0 = 0
        self.ns_cmd_nicset.rx_mode1 = 2 # receive both unicast and broadcast packet

    def set_nicmode(self, pidx):
        if pidx >= 0:
            self.log_file.write(0, "(Socket1) CommandID = 0x0028(NIC Mode Set)")
            self.config_cmd_header(pidx, 0x28, 0x1)
            self.ns_cmd_nicset.chassis_id = self.ns_info_portlist[pidx].chassis_id
            self.ns_cmd_nicset.board_id = self.ns_info_portlist[pidx].board_id
            self.ns_cmd_nicset.port_id = self.ns_info_portlist[pidx].port_id
            stream = self.ns_cmd_header.get_payload() + self.ns_cmd_nicset.get_payload()
            self.config_ack(self.ns_cmd_header.command_id, pidx)
            self.sendpkt_sock1(stream)
            return 1
        else:
            return 0

    def set_slot_power(self):
        self.log_file.write(0, "(Socket1) CommandID = 0x00A0(Chassis Power Set)")
        self.ns_cmd_header.command_id = 0xa0
        self.ns_cmd_header.sequence_num = self.sequence_num
        self.ns_cmd_header.sub_command_id = 0
        self.ns_cmd_header.client_id = self.client_id

        self.ns_cmd_globalpower.chassis_id = 0xffff
        self.ns_cmd_globalpower.board_id = 0xff
        self.ns_cmd_globalpower.port_id = 0xff

        if self.server_type == 0:
            self.ns_cmd_globalpower.power_map[0] = self.map_powerset[0]>>1+self.map_powerset[1]<<7&0x80
            self.ns_cmd_globalpower.power_map[1] = self.map_powerset[1]>>1+self.map_powerset[2]<<7&0x80
            self.ns_cmd_globalpower.power_map[2] = self.map_powerset[2]>>1+self.map_powerset[3]<<7&0x80
            self.ns_cmd_globalpower.power_map[3] = self.map_powerset[3]>>1
        elif self.server_type == 1:
            for idx in range(4):
                self.ns_cmd_globalpower.power_map[idx] = self.map_powerset[idx]
        stream = self.ns_cmd_header.get_payload() + self.ns_cmd_globalpower.get_payload()
        self.config_ack(self.ns_cmd_header.command_id, -1)
        self.sendpkt_sock1(stream)
        return 1

    def get_slot_power(self):
        self.log_file.write(0, "(Socket1) CommandID = 0x0010(Get Board Status include Power Report)")
        self.ns_cmd_header.command_id = 0x10
        self.ns_cmd_header.sequence_num = self.sequence_num
        self.ns_cmd_header.sub_command_id = 0
        self.ns_cmd_header.client_id = self.client_id
        stream = self.ns_cmd_header.get_payload()+struct.pack("!HBBH", self.server_chassis, self.server_slot, 1, self.server_chassis)
        self.config_ack(self.ns_cmd_header.command_id, self.get_portidx(self.server_chassis, self.server_slot, 1))
        self.sendpkt_sock1(stream)
        return 1
    ##############################  </Common Command>  ##################################

    ##############################  <Getting Status Command>  ##############################
    # info : Getting the summary information from array
    # function : 
    #     get_version_api
    #     get_version_hw
    #     get_version_fw
    #     get_version_prom
    #     get_serialnum
    #     get_macaddr
    #     get_manudate
    #     get_license_mode
    #     get_license_date
    #     get_media_speed
    #     get_media_duplex
    #     get_media_autonego
    #     get_media_signal
    #     get_counter_port
    #     get_counter_stream_rx_pkts
    #     get_counter_stream_rx_bytes
    #     get_counter_stream_rx_latency
    #     get_counter_stream_tx_pkts
    #     get_counter_stream_tx_bytes
    

    def get_version_api(self):
        return self.ver_api
    def get_version_hw(self, slotid):
        infostr = ""
        for sidx in range(len(self.ns_info_boardlist)):
            if slotid == self.ns_info_boardlist[sidx].board_id:
                infostr = self.ns_info_boardlist[sidx].version_hw
        return infostr
    def get_version_fw(self, slotid):
        infostr = ""
        for sidx in range(len(self.ns_info_boardlist)):
            if slotid == self.ns_info_boardlist[sidx].board_id:
                infostr = self.ns_info_boardlist[sidx].version_fw
        return infostr
    def get_version_prom(self, slotid):
        infostr = ""
        for sidx in range(len(self.ns_info_boardlist)):
            if slotid == self.ns_info_boardlist[sidx].board_id:
                infostr = self.ns_info_boardlist[sidx].version_prom
        return infostr
    def get_serialnum(self, slotid):
        infostr = ""
        for sidx in range(len(self.ns_info_boardlist)):
            if slotid == self.ns_info_boardlist[sidx].board_id:
                infostr = self.ns_info_boardlist[sidx].serial_num
        return infostr
    def get_macaddr(self, slotid):
        infostr = ""
        for sidx in range(len(self.ns_info_boardlist)):
            if slotid == self.ns_info_boardlist[sidx].board_id:
                infostr = self.ns_info_boardlist[sidx].mac_addr
        return infostr
    def get_manudate(self, slotid):
        infostr = ""
        for sidx in range(len(self.ns_info_boardlist)):
            if slotid == self.ns_info_boardlist[sidx].board_id:
                infostr = self.ns_info_boardlist[sidx].manual_date
        return infostr
    def get_modelname(self, slotid):
        infostr = ""
        for sidx in range(len(self.ns_info_boardlist)):
            if slotid == self.ns_info_boardlist[sidx].board_id:
                cardid = self.ns_info_boardlist[sidx].card_type
                if cardid > 51 and cardid < 250:
                    if cardid < 200:
                        infostr = self.arr_str_cardtype[cardid-50]
                    else:
                        infostr = self.arr_str_cardtype_new[cardid-200]
                else:
                    infostr = "Unknow Model"
        return infostr

    def get_license_mode(self, slotid):
        infostr = ""
        for sidx in range(len(self.ns_info_boardlist)):
            if slotid == self.ns_info_boardlist[sidx].board_id:
                infostr = self.ns_info_boardlist[sidx].license_mode
        return infostr
    def get_license_date(self, slotid):
        infostr = ""
        for sidx in range(len(self.ns_info_boardlist)):
            if slotid == self.ns_info_boardlist[sidx].board_id:
                infostr = self.ns_info_boardlist[sidx].license_date
        return infostr
            
    def get_media_speed(self, pidx):
        if pidx >= 0:
            return self.ns_info_portlist[pidx].media_speed
        else:
            return "n/a"
    def get_media_duplex(self, pidx):
        if pidx >= 0:
            return self.ns_info_portlist[pidx].media_duplex
        else:
            return "n/a"
    def get_media_autonego(self, pidx):
        if pidx >= 0:
            return self.ns_info_portlist[pidx].media_autonego
        else:
            return "n/a"
    def get_media_signal(self, pidx):
        if pidx >= 0:
            return self.ns_info_portlist[pidx].media_signal
        else:
            return "n/a"

    # 20160930, TK, added. get port counter using index. using CounterStack to instead of counter list
    def get_counter_port(self, pidx, cidx):
        if cidx == ns_const.IDX_PORTCOUNTER_RX_RATE_BYTE or cidx == ns_const.IDX_PORTCOUNTER_RX_RATE_PKT or cidx == ns_const.IDX_PORTCOUNTER_TX_RATE_BYTE or cidx == ns_const.IDX_PORTCOUNTER_TX_RATE_PKT:
            tmpslice = (cidx, cidx+4)
            tmpVal32 = self.ns_info_portlist[pidx].port_counter_stack[slice(*tmpslice)]
            return self.merge_to_32b(tmpVal32)
        else:
            tmpslice = (cidx, cidx+8)
            tmpVal64 = self.ns_info_portlist[pidx].port_counter_stack[slice(*tmpslice)]
            return self.merge_to_64b(tmpVal64)

    # get stream counter
    def get_counter_stream_rx_pkts(self, pidx, sidx):
        if pidx >= 0 and sidx >=0 and sidx < 64:
            return self.ns_info_portlist[pidx].stream_counter_rx[sidx].count_pkts
        else:
            return -1
    def get_counter_stream_rx_bytes(self, pidx, sidx):
        if pidx >= 0 and sidx >=0 and sidx < 64:
            return self.ns_info_portlist[pidx].stream_counter_rx[sidx].count_bytes
        else:
            return -1
    def get_counter_stream_rx_latency(self, pidx, sidx):
        if pidx >= 0 and sidx >=0 and sidx < 64:
            return self.ns_info_portlist[pidx].stream_counter_rx[sidx].latency
        else:
            return -1
    def get_counter_stream_tx_pkts(self, pidx, sidx):
        if pidx >= 0 and sidx >=0 and sidx < 64:
            return self.ns_info_portlist[pidx].stream_counter_tx[sidx].count_pkts
        else:
            return -1
    def get_counter_stream_tx_bytes(self, pidx, sidx):
        if pidx >= 0 and sidx >=0 and sidx < 64:
            return self.ns_info_portlist[pidx].stream_counter_tx[sidx].count_bytes
        else:
            return -1
    ##############################  </Getting Status Command>  ##############################
    
    

    ##############################  <Report Parser>  ##################################
    # Report Command - 0x80FE
    def parse_report_status_port(self, pktlist):
        self.log_file.write(3, "(PortStatus) CommandID = 0x80FE")
        #print("(Parser)(PortStatus) CommandID = 0x80FE")
        self.total_port_num = pktlist[21]
        # read client id
        self.client_id = pktlist[2]*256+pktlist[3]
        #clear port list first
        self.ns_info_portlist[:] = []
        for pidx in range(self.total_port_num):
            tmpPInfo = NuStreamsInfoPort()
            tmpPInfo.chassis_id = pktlist[23+pidx*6]
            tmpPInfo.board_id = pktlist[24+pidx*6]
            tmpPInfo.port_id = pktlist[25+pidx*6]
            tmpPInfo.card_type = pktlist[26+pidx*6]
            if tmpPInfo.card_type == 96:
                self.server_type = 1
                self.server_slot = tmpPInfo.board_id
                self.server_chassis = tmpPInfo.chassis_id
            elif tmpPInfo.card_type == 95:
                self.server_type = 0
                self.server_slot = tmpPInfo.board_id
                self.server_chassis = tmpPInfo.chassis_id
            tmpPInfo.lock_status = pktlist[27+pidx*6]
            # 20170728, TK, added 新添加mac/ip
            tmpPInfo.mac_my[0] = 0x0
            tmpPInfo.mac_my[1] = 0x22
            tmpPInfo.mac_my[2] = 0xa2
            tmpPInfo.mac_my[3] = tmpPInfo.chassis_id
            tmpPInfo.mac_my[4] = tmpPInfo.board_id
            tmpPInfo.mac_my[5] = tmpPInfo.port_id
            tmpPInfo.ip_my[0] = 192
            tmpPInfo.ip_my[1] = 168
            tmpPInfo.ip_my[2] = tmpPInfo.board_id
            tmpPInfo.ip_my[3] = tmpPInfo.port_id
            
            self.ns_info_portlist.append(tmpPInfo)
        # show all stream contets by hex
        #print str.join("", ("%02x " % i for i in pktlist))

    def parse_report_status_board(self, pktlist):
        # 20161221, TK, modified. find board index first, if no board, append.
        # pktlist 22 is board id, slot number-1 into array index
        self.log_file.write(3, "(BoardStatus) CommandID = 0x500")
        tmpCID = pktlist[20]*256+pktlist[21]
        tmpBID = pktlist[22]
        tmpPID = pktlist[23]
        tmpBidx = -1
        for bidx in range(len(self.ns_info_boardlist)):
            if tmpCID == self.ns_info_boardlist[bidx].chassis_id and tmpBID == self.ns_info_boardlist[bidx].board_id and tmpPID == self.ns_info_boardlist[bidx].port_id:
                tmpBidx = bidx
        if tmpBidx == -1:
            tmpBInfo = NuStreamsInfoBoard()
            tmpBInfo.chassis_id = tmpCID
            tmpBInfo.board_id = tmpBID
            tmpBInfo.port_id = tmpPID
            self.ns_info_boardlist.append(tmpBInfo)
            #20231116, TK, modified. avoid always 0
            tmpBidx = len(self.ns_info_boardlist)-1
        # update the boardstatus
        self.ns_info_boardlist[tmpBidx].card_type = pktlist[8]*256+pktlist[9]
        # for firmware version
        majotNo = pktlist[28]*256+pktlist[29]
        minorNo = pktlist[30]*256+pktlist[31]
        buildNo = pktlist[42]*256+pktlist[43]
        self.ns_info_boardlist[tmpBidx].version_fw = "v%d.%db%03d" % (majotNo, minorNo, buildNo)
        # for PROM
        majotNo = pktlist[32]*256+pktlist[33]
        minorNo = pktlist[34]*256+pktlist[35]
        buildNo = pktlist[44]*256+pktlist[45]
        self.ns_info_boardlist[tmpBidx].version_prom = "v%d.%db%03d" % (majotNo, minorNo, buildNo)
        # for HW
        majotNo = pktlist[36]*256+pktlist[37]
        minorNo = pktlist[38]*256+pktlist[39]
        buildNo = pktlist[40]*256+pktlist[41]
        self.ns_info_boardlist[tmpBidx].version_hw = "v%d.%db%03d" % (majotNo, minorNo, buildNo)

        buildNo = pktlist[46]*256+pktlist[47]
        self.ns_info_boardlist[tmpBidx].version_pcb = "v%d" %buildNo

        self.ns_info_boardlist[tmpBidx].datecode_fw = "%02x%02x/%02x/%02x" % (pktlist[50], pktlist[51], pktlist[48], pktlist[49])
        self.ns_info_boardlist[tmpBidx].datecode_prom = "%02x%02x/%02x/%02x" % (pktlist[54], pktlist[55], pktlist[52], pktlist[53])
        self.ns_info_boardlist[tmpBidx].datecode_hw = "%02x%02x/%02x/%02x" % (pktlist[58], pktlist[59], pktlist[56], pktlist[57])
        

        # store to chassis information
        if self.ns_info_boardlist[tmpBidx].board_id == self.server_slot:
            self.ns_info_chassis.version_fw = self.ns_info_boardlist[tmpBidx].version_fw
            self.ns_info_chassis.version_hw = self.ns_info_boardlist[tmpBidx].version_hw
            self.ns_info_chassis.version_pcb = self.ns_info_boardlist[tmpBidx].version_pcb
            


    def parse_report_status_power(self, pktlist):
        self.log_file.write(3, "(PowerStatus) CommandID = 0x1900")
        # should be (0xffff, 0xff, 0xff) or management module
        #tmpCID = pktlist[20]*256+pktlist[21]
        #tmpBID = pktlist[22]
        #tmpPID = pktlist[23]
        # pktlist[26]/pktlist[27] store to self.ns_info_chassis.list_slot_power
        tmpPortMapH = pktlist[24]*256+pktlist[25]
        tmpPortMapL = pktlist[26]*256+pktlist[27]
        for sidx in range(len(self.map_powershow)):
            comparenum = tmpPortMapL&pow(2, sidx)
            self.map_powershow[sidx] = 'on' if comparenum>0 else 'off'
            
              
    def parse_report_eeprom(self, pktlist):
        # 20161220, TK, modified. find board index first, if no board, append.
        self.log_file.write(3, "(EEPROMStatus) CommandID = 0x1E00")
        tmpCID = pktlist[20]*256+pktlist[21]
        tmpBID = pktlist[22]
        tmpPID = pktlist[23]
        tmpBidx = -1
        for bidx in range(len(self.ns_info_boardlist)):
            if tmpCID == self.ns_info_boardlist[bidx].chassis_id and tmpBID == self.ns_info_boardlist[bidx].board_id and tmpPID == self.ns_info_boardlist[bidx].port_id:
                tmpBidx = bidx
        if tmpBidx == -1:
            tmpBInfo = NuStreamsInfoBoard()
            tmpBInfo.chassis_id = tmpCID
            tmpBInfo.board_id = tmpBID
            tmpBInfo.port_id = tmpPID
            self.ns_info_boardlist.append(tmpBInfo)
            #tmpBidx = 0
            tmpBidx = len(self.ns_info_boardlist)-1

        self.log_file.write(2, "(EEPROMStatus) boardlist size = %d" %len(self.ns_info_boardlist))

        # is exist boardinfo list
        idx_start = 26
        idx_eeprom = 66
        # License Version
        licver = (pktlist[idx_start+idx_eeprom]-48)*10+(pktlist[idx_start+idx_eeprom+1]-48)

        tmpIsNewVer = 0
        if licver > 17:
            tmpIsNewVer = 1
        
        # Serial Number
        _sn = ""
        if tmpIsNewVer:
            idx_eeprom = 0
            for i in range(12):
                _sn +=  "%c" %pktlist[idx_start+idx_eeprom+i]
        else:
            idx_eeprom = 76
            for i in range(20):
                _sn +=  "%c" %pktlist[idx_start+idx_eeprom+i]
        
        self.ns_info_boardlist[tmpBidx].serial_num = _sn
        # Manufacture Date
        if tmpIsNewVer:
            idx_eeprom = 28
            _manudate = "20%02X-%02d-01" %(pktlist[idx_start+idx_eeprom], pktlist[idx_start+idx_eeprom+1]/4)
        else:
            idx_eeprom = 96
            _manudate = "%c%c%c%c-%c%c-%c%c %c%c:%c%c" %(pktlist[idx_start+idx_eeprom], pktlist[idx_start+idx_eeprom+1], pktlist[idx_start+idx_eeprom+2], pktlist[idx_start+idx_eeprom+3], pktlist[idx_start+idx_eeprom+4], pktlist[idx_start+idx_eeprom+5], 
                                                    pktlist[idx_start+idx_eeprom+6], pktlist[idx_start+idx_eeprom+7], pktlist[idx_start+idx_eeprom+8], pktlist[idx_start+idx_eeprom+9], pktlist[idx_start+idx_eeprom+10], pktlist[idx_start+idx_eeprom+11])
        
        
        self.ns_info_boardlist[tmpBidx].manual_date = _manudate
        # MAC Address
        _mac =""
        idx_eeprom = 16 if tmpIsNewVer else 128
        
        for i in range(6):
            _mac +=  "%02x" %pktlist[idx_start+idx_eeprom+i]
        self.ns_info_boardlist[tmpBidx].mac_addr = _mac
        # Agent/Custom
        idx_eeprom = 50

        idx_eeprom = 76 if tmpIsNewVer else 50
        
        _agentcustomcode = "%d/%d" %(pktlist[idx_start+idx_eeprom]*256+pktlist[idx_start+idx_eeprom+1], pktlist[idx_start+idx_eeprom+2]*1048576+pktlist[idx_start+idx_eeprom+3]*65536+pktlist[idx_start+idx_eeprom+4]*4096+pktlist[idx_start+idx_eeprom+5]*256+pktlist[idx_start+idx_eeprom+6]*16+pktlist[idx_start+idx_eeprom+7])
        
        # hardware license
        idx_eeprom = 196
        idx_eeprom = 92 if tmpIsNewVer else 196
        
        ### version 15
        # bit15 set demo/normal
        # bit12~14 year(date mode or normal) + 2010
        # bit8~11 month(date mode or normal)
        ### version 16/17
        # bit15 set demo/normal
        # bit4~13 year(date mode or normal) + 2010
        # bit0~3 month(date mode or normal)
        ### version 20
        # bit15 set demo/normal
        # bit9~14 year(date mode or normal) + 2011
        # bit5~8 month(date mode or normal)
        # bit0~4 day(date mode or normal)
        tmpLicCode = pktlist[idx_start+idx_eeprom]*256+pktlist[idx_start+idx_eeprom+1]
        if tmpLicCode&0x8000 == 0:
            # using string to display
            _licMode = "Normal    "
        else:
            _licMode = "Evaluation"
        self.ns_info_boardlist[tmpBidx].license_mode = _licMode
        if licver < 16:
            _year = (tmpLicCode&0x7fff)/4096 + 2010
            _month = (tmpLicCode&0x0f00)/256
            _licDate = "%04d/%02d" %(_year, _month)
        elif licver == 16 or licver == 17:
            _year = (tmpLicCode&0x3fff)/16 + 2010
            _month = (tmpLicCode&0x000F)
            _licDate = "%04d/%02d" %(_year, _month)
        #20231113, TK, for new license mode
        elif licver > 18:
            _year = (tmpLicCode&0x7fff)/512 + 2021
            _month = (tmpLicCode&0x01FF)/32
            # day is ignore
            _licDate = "%04d/%02d" %(_year, _month)
        self.ns_info_boardlist[tmpBidx].license_date = _licDate

        # for software license if control module
        # clear the software license
        
        if self.ns_info_boardlist[tmpBidx].board_id == self.server_slot:
            self.ns_info_chassis.serial_num = _sn
            self.ns_info_chassis.manual_date = _manudate
            self.ns_info_chassis.mac_addr = _mac
            self.ns_info_chassis.agent_custom_code = _agentcustomcode
            self.ns_info_chassis.licence_mode_hw = _licMode
            self.ns_info_chassis.license_date_hw = _licDate
            self.ns_info_chassis.list_software_lic[:] = []
            
            idx_eeprom = 188 if tmpIsNewVer else 108
            
            index = 0
            while index < 10:
                tmpSWLic = NuStreamsLicense()
                tmpLicCode = pktlist[idx_start+idx_eeprom+(index*2)]*256+pktlist[idx_start+idx_eeprom+1+(index*2)]
                if tmpLicCode&0x8000 > 0:
                    tmpSWLic.license_mode = "Normal    "
                else:
                    tmpSWLic.license_mode = "Evaluation"
                ### version 15
                # bit15 demo or normal 
                # bit12~14 year + 2010
                # bit8~11 month
                # bit0~7 demo times
                ### version 16/17
                # bit15 0 demo,1 normal, 
                # bit14 0 date mode,1 time mode
                # bit4~13 year(date mode or normal) + 2010
                # bit0~3 month(date mode or normal)
                # bit0~13 demo times(time mode)
                ### version 20
                # bit15 0 demo,1 normal, 
                # bit9~14 year(date mode or normal) + 2011
                # bit5~8 month(date mode or normal)
                # bit0~4 day(date mode or normal)
                if licver < 16:
                    _year = (tmpLicCode&0x7fff)/4096 + 2010
                    _month = (tmpLicCode&0x0f00)/256
                    _times = pktlist[idx_start+109+(index*2)]
                    if _times == 0:
                        # times or date only select one to show
                        tmpSWLic.license_times = "-- "
                        tmpSWLic.license_date = "%04d/%02d" %(_year, _month)
                    else:
                        tmpSWLic.license_times = "%d" %_times
                        tmpSWLic.license_date = "--     "
                elif licver == 16 or licver == 17:
                    if tmpLicCode&0x4000 > 0:
                        _dateortime = 1
                    else:
                        _dateortime = 0
                    if _dateortime == 1:
                        _year = (tmpLicCode&0x3fff)/16 + 2010
                        _month = (tmpLicCode&0x000F)
                        tmpSWLic.license_date = "%04d/%02d" %(_year, _month)
                        tmpSWLic.license_times = "0"
                    else:
                        # ç©ºæ ¼ç¨ä¾å°é½ç
                        tmpSWLic.license_date = "--     "
                        tmpSWLic.license_times = "%d" %(tmpLicCode&0x3FFF)
                #20231113, TK, for new license mode
                elif licver > 18: 
                    _year = (tmpLicCode&0x7fff)/512 + 2021
                    _month = (tmpLicCode&0x01FF)/32
                    tmpSWLic.license_date = "%04d/%02d" %(_year, _month)
                self.ns_info_chassis.list_software_lic.append(tmpSWLic)
                index += 1

    def parse_report_status_link(self, pktlist):
        # 20191118, TK, modified. change media speed from string to const value
        self.log_file.write(3, "(ServerLinkStatus) CommandID = 0x80FC")
        tmpCID = pktlist[20]*256+pktlist[21]
        tmpBID = pktlist[22]
        tmpPID = pktlist[23]
        pidx = self.get_portidx(tmpCID, tmpBID, tmpPID)
        if self.is_exist_callback:
            self.invoke_callback(tmpCID, tmpBID, tmpPID, 0x400)
        if pidx >= 0:
            fibermode = pktlist[24]
            mediatype = pktlist[25]
            self.ns_info_portlist[pidx].is_fiber = 0
            self.ns_info_portlist[pidx].is_linkdown = 0
            self.ns_info_portlist[pidx].media_duplex = "Full"
            self.ns_info_portlist[pidx].media_autonego = "Auto"
            self.ns_info_portlist[pidx].media_speed = ns_const.MEDIA_SPEED_100M
            # self.ns_info_portlist[pidx].media_speed = "100M"

            self.ns_info_portlist[pidx].media_signal = "Copper"
            # 0x80 is fiber bit
            if fibermode == 0x80:
                self.ns_info_portlist[pidx].is_fiber = 1
                self.ns_info_portlist[pidx].media_signal = "Fiber"
                # full duplex
                self.ns_info_portlist[pidx].media_duplex = "Full"
                self.ns_info_portlist[pidx].media_autonego = "Auto"
            # link down
            if mediatype == 0xff:
                self.ns_info_portlist[pidx].is_linkdown = 1
                self.ns_info_portlist[pidx].media_speed = ns_const.MEDIA_SPEED_LINKDOWN
            else:
                if mediatype%2 == 0:
                    self.ns_info_portlist[pidx].media_duplex = "Half"
                else:
                    self.ns_info_portlist[pidx].media_duplex = "Full"
                # 0~7
                if mediatype < 8:
                    if mediatype%4 < 2:
                        # self.ns_info_portlist[pidx].media_speed = "10M"
                        self.ns_info_portlist[pidx].media_speed = ns_const.MEDIA_SPEED_10M
                    else:
                        # self.ns_info_portlist[pidx].media_speed = "100M"
                        self.ns_info_portlist[pidx].media_speed = ns_const.MEDIA_SPEED_100M
                    if mediatype < 4:
                        self.ns_info_portlist[pidx].media_autonego = "Force"
                    else:
                        self.ns_info_portlist[pidx].media_autonego = "Auto"
                # 8~11
                elif mediatype < 12 and mediatype > 7:
                    # self.ns_info_portlist[pidx].media_speed = "1G"
                    self.ns_info_portlist[pidx].media_speed = ns_const.MEDIA_SPEED_1G
                    if mediatype < 10:
                        self.ns_info_portlist[pidx].media_autonego = "Force"
                    else:
                        self.ns_info_portlist[pidx].media_autonego = "Auto"
                elif mediatype > 15:
                    # self.ns_info_portlist[pidx].media_speed = "10G"
                    self.ns_info_portlist[pidx].media_speed = ns_const.MEDIA_SPEED_5G
                    if mediatype == 16:
                        self.ns_info_portlist[pidx].media_autonego = "Force"
                    else:
                        self.ns_info_portlist[pidx].media_autonego = "Auto"
                elif mediatype > 13:
                    # self.ns_info_portlist[pidx].media_speed = "10G"
                    self.ns_info_portlist[pidx].media_speed = ns_const.MEDIA_SPEED_2P5G
                    if mediatype == 14:
                        self.ns_info_portlist[pidx].media_autonego = "Force"
                    else:
                        self.ns_info_portlist[pidx].media_autonego = "Auto"
                elif mediatype > 11:
                    # self.ns_info_portlist[pidx].media_speed = "10G"
                    self.ns_info_portlist[pidx].media_speed = ns_const.MEDIA_SPEED_10G
                    if mediatype == 12:
                        self.ns_info_portlist[pidx].media_autonego = "Force"
                    else:
                        self.ns_info_portlist[pidx].media_autonego = "Auto"

    def parse_report_status_lock(self, pktlist):
        self.log_file.write(3, "(PortStatus) CommandID = 0x0E00")
        tmpCID = pktlist[20]*256+pktlist[21]
        tmpBID = pktlist[22]
        tmpPID = pktlist[23]
        pidx = self.get_portidx(tmpCID, tmpBID, tmpPID)
        # 20170815, TK, modified. is_lock_success means lock success or fail
        # lock status while setting lock/unlock command. 
        if pidx >= 0:
            self.ns_info_portlist[pidx].is_lock_success = pktlist[25]
            #print ("Port %d lockstatus = %d"%(pidx, self.ns_info_portlist[pidx].is_lock_success))

    def parse_report_ping(self, pktlist):
        self.log_file.write(3, "(PingStatus) CommandID = 0x0700")
        tmpCID = pktlist[20]*256+pktlist[21]
        tmpBID = pktlist[22]
        tmpPID = pktlist[23]
        pidx = self.get_portidx(tmpCID, tmpBID, tmpPID)
        if pidx >= 0:
            # the success bit in ping report
            if self.ns_info_portlist[pidx].is_ping_success == 0 :
                if pktlist[25] == 1:
                    print("Got ARP Reply")
                elif pktlist[25] == 0:
                    print("Pingv4 success")
                    tmpPingInfo = NuStreamsInfoPing()
                    for idx in range(6):
                        self.ns_info_portlist[pidx].mac_serv[idx] = pktlist[38+idx]
                    for idx in range(4):
                        self.ns_info_portlist[pidx].ping_ip[idx] = pktlist[58+idx]
                    self.ns_info_portlist[pidx].ping_datalen = (pktlist[48]*256+pktlist[49])-20-8 # ip header=20, icmp header=8
                    self.ns_info_portlist[pidx].ping_ttl = pktlist[54]
                    #self.ns_info_pinglist.append(tmpPingInfo)
                    tmpip = "%d.%d.%d.%d"%(self.ns_info_portlist[pidx].ping_ip[0], self.ns_info_portlist[pidx].ping_ip[1], self.ns_info_portlist[pidx].ping_ip[2], self.ns_info_portlist[pidx].ping_ip[3])
                    tmpmac = "%02X:%02X:%02X:%02X:%02X:%02X"%(self.ns_info_portlist[pidx].mac_serv[0], self.ns_info_portlist[pidx].mac_serv[1], self.ns_info_portlist[pidx].mac_serv[2], 
                                                              self.ns_info_portlist[pidx].mac_serv[3], self.ns_info_portlist[pidx].mac_serv[4], self.ns_info_portlist[pidx].mac_serv[5])
                    str_show = "Reply From: "+tmpip+", MAC: "+tmpmac+", Data Length: "+str(self.ns_info_portlist[pidx].ping_datalen)+", TTL:"+str(self.ns_info_portlist[pidx].ping_ttl)
                    print(str_show)
                    self.ns_info_portlist[pidx].is_ping_success = 1
                elif pktlist[25] == 7:
                    self.ns_info_portlist[pidx].is_ping_success = 1
                    print("Pingv6 success")
                elif pktlist[25] == 4:
                    print("Got NDP")
                elif pktlist[25] == 2:
                    print("ICMPv4 reply timeout")
                elif pktlist[25] == 3:
                    print("ARP reply timeout")
                elif pktlist[25] == 5:
                    print("NDP timeout")
                elif pktlist[25] == 8:
                    print("ICMPv6 reply timeout")
    
    def parse_report_dhcp(self, pktlist):
        self.log_file.write(3, "(DHCPStatus) CommandID = 0x0700")
        tmpCID = pktlist[20]*256+pktlist[21]
        tmpBID = pktlist[22]
        tmpPID = pktlist[23]
        pidx = self.get_portidx(tmpCID, tmpBID, tmpPID)
        if pidx >= 0:
            if pktlist[25] == 3: # Ack received, dhcp success, carrying ack packet.
                for idx in range(6):
                    self.ns_info_portlist[pidx].mac_serv[idx] = pktlist[38+idx]
                for idx in range(4):
                    self.ns_info_portlist[pidx].ip_serv[idx] = pktlist[58+idx]
                    self.ns_info_portlist[pidx].ip_my[idx] = pktlist[90+idx]
                tmpMAC = "Server MAC = %02X:%02X:%02X:%02X:%02X:%02X"%(self.ns_info_portlist[pidx].mac_serv[0], self.ns_info_portlist[pidx].mac_serv[1], self.ns_info_portlist[pidx].mac_serv[2], 
                                                                       self.ns_info_portlist[pidx].mac_serv[3], self.ns_info_portlist[pidx].mac_serv[4], self.ns_info_portlist[pidx].mac_serv[5])
                print(tmpMAC)
                tmpIP = "Server IP = %d.%d.%d.%d"%(self.ns_info_portlist[pidx].ip_serv[0], self.ns_info_portlist[pidx].ip_serv[1], self.ns_info_portlist[pidx].ip_serv[2], self.ns_info_portlist[pidx].ip_serv[3])
                print(tmpIP)
                tmpIP = "MyIP = %d.%d.%d.%d"%(self.ns_info_portlist[pidx].ip_my[0], self.ns_info_portlist[pidx].ip_my[1], self.ns_info_portlist[pidx].ip_my[2], self.ns_info_portlist[pidx].ip_my[3])
                print(tmpIP)

    def parse_report_txend(self, pktlist):
        self.log_file.write(3, "(TxEnd) CommandID = 0x300")
        tmpCID = pktlist[20]*256+pktlist[21]
        tmpBID = pktlist[22]
        tmpPID = pktlist[23]
        pidx = self.get_portidx(tmpCID, tmpBID, tmpPID)
        if self.is_exist_callback:
            self.invoke_callback(tmpCID, tmpBID, tmpPID, 0x300)
        # lock status while setting lock/unlock command
        if pidx >= 0:
            self.ns_info_portlist[pidx].is_txend = 1

    def parse_report_stream(self, pktlist):
        self.log_file.write(3, "(Stream Counter) CommandID = 0x1500")
        tmpCID = pktlist[20]*256+pktlist[21]
        tmpBID = pktlist[22]
        tmpPID = pktlist[23]
        ridx = 24
        pidx = self.get_portidx(tmpCID, tmpBID, tmpPID)
        while ridx < len(pktlist):
            # Tx Stream header id = 0x10, Rx Stream(XTAG) header id = 0x20
            # index + 1 means stream index. 
            sidx = pktlist[ridx+1]
            if pktlist[ridx] == 0x10:
                ridx += 2
                # 6 bytes for packet counts
                tmpslice = (ridx, ridx+6)
                tmpVal48 = pktlist[slice(*tmpslice)]
                pktval = (tmpVal48[0] << 40) + (tmpVal48[1] << 32) + (tmpVal48[2] << 24) + (tmpVal48[3] << 16) + (tmpVal48[4] << 8) + tmpVal48[5]
                self.ns_info_portlist[pidx].stream_counter_tx[sidx].count_pkts = pktval
                #if sidx < 16:
                ridx += 6
                # 8 bytes for byte counts
                tmpslice = (ridx, ridx+8)
                tmpVal64 = pktlist[slice(*tmpslice)]
                self.ns_info_portlist[pidx].stream_counter_tx[sidx].count_bytes = self.merge_to_64b(tmpVal64)
                ridx += 8
                # for sync 1024(4B) and current SN(2B)
                ridx += 6
                # tx stream counter size = 22 bytes
            elif pktlist[ridx] == 0x20:
                ridx += 2
                tmpslice = (ridx, ridx+6)
                tmpVal48 = pktlist[slice(*tmpslice)]
                pktval = (tmpVal48[0] << 40) + (tmpVal48[1] << 32) + (tmpVal48[2] << 24) + (tmpVal48[3] << 16) + (tmpVal48[4] << 8) + tmpVal48[5]
                self.ns_info_portlist[pidx].stream_counter_rx[sidx].count_pkts = pktval
                ridx += 6
                tmpslice = (ridx, ridx+8)
                tmpVal64 = pktlist[slice(*tmpslice)]
                self.ns_info_portlist[pidx].stream_counter_rx[sidx].count_bytes = self.merge_to_64b(tmpVal64)
                ridx += 8
                # for rate value(4B) and sync 1024(4B)
                ridx += 8
                tmpslice = (ridx, ridx+4)
                tmpVal32 = pktlist[slice(*tmpslice)]
                self.ns_info_portlist[pidx].stream_counter_rx[sidx].latency = self.merge_to_32b(tmpVal32)
                ridx += 4
                # for slotid(2) + previous sn(2) + lost packet cnt(6) + sn error cnt(6) + ipcs error cnt(6)
                ridx += 22
                # rx xtag stream counter size = 50 bytes
            # while ridx < packet len
            else:
                break;
            
        #if pidx >= 0:

    # 20160930, TK, added. not process the counter report, just store it. User translating the value from report array by index. 
    # this way can save a lot of process time. 
    def parse_report_port(self, pktlist):
        self.log_file.write(3, "(Port Counter2) CommandID = 0x100")
        tmpCID = pktlist[20]*256+pktlist[21]
        tmpBID = pktlist[22]
        tmpPID = pktlist[23]
        pidx = self.get_portidx(tmpCID, tmpBID, tmpPID)
        if pidx >= 0:
            # just copy all pktlist contents to CounterStack, every port store the newest report, so it just have only one report.
            self.ns_info_portlist[pidx].port_counter_stack = pktlist[:]

    def parse_report_capture(self, pktlist):
        self.log_file.write(3, "(Capture) CommandID = 0x200")
        tmpCID = pktlist[20]*256+pktlist[21]
        tmpBID = pktlist[22]
        tmpPID = pktlist[23]
        pidx = self.get_portidx(tmpCID, tmpBID, tmpPID)
        if pidx >= 0:
            pkt_len = pktlist[24]*256 + pktlist[25]
            timestamp = pktlist[36]*16777216+pktlist[37]*65536+pktlist[38]*256+pktlist[39]
            #20170602, TK, modified. using length index
            #ns_pktdb.append_packet(pidx,pkt_len,timestamp,pktlist[40:len(pktlist)])
            ns_pktdb.append_packet(pidx,pkt_len,timestamp,pktlist[40:(40+pkt_len)])
            
        
    # 20160930, TK, comment. It's waste many time to parsr report, now abandon
    ##############################  </Report Parser>  ##################################
    
    ##############################  <T451 Report Parser>  ##################################
    def asciitostr(self, list):
        return array.array('B', list).tostring()

    def parse_t451report_clientid(self, pktlist):
        self.log_file.write(3, "(Get Client ID) CommandID = 0x80FD")
        self.client_id = pktlist[2]*256+pktlist[3]
        tmpchassis = pktlist[24:24+6]
        
        for idx in range(16):
            if set(self.t451_info_board[idx].chassis_id) == set(tmpchassis):
                break
            else:
                if set(self.t451_info_board[idx].chassis_id) == set([0,0,0,0,0,0]):
                    for cidx in range(6):
                        self.t451_info_board[idx].chassis_id[cidx] = tmpchassis[cidx]
                    break
                elif set(self.t451_info_board[idx].chassis_id) != set([0,0,0,0,0,0]):
                    continue
        

        #print self.t451_info_board[ridx].chassis_id
        
    def parse_t451report_status_port(self, cidx, pktlist):
        self.log_file.write(3, "(Port Status) CommandID = 0x80C1")
        
        # 4bytes version, but using 2 bytes
        self.t451_info_board[cidx].version_hw = "v"+str(pktlist[30])+"."+str(pktlist[31])
        self.t451_info_board[cidx].version_fw = "v"+str(pktlist[34]*255+pktlist[35])+"."+str(pktlist[38]*255+pktlist[39])+"b"+str(pktlist[42]*255+pktlist[43])
        self.t451_info_board[cidx].status = pktlist[47] # 0 off line; 1 error ; 2 upgrade ; 3 normal.

        self.t451_info_board[cidx].model_name = asciitostr(pktlist[48:48+16])
        self.t451_info_board[cidx].serial_num = asciitostr(pktlist[66:66+12])
        self.t451_info_board[cidx].license_mode = pktlist[87]+pktlist[86]*256
        self.t451_info_board[cidx].license_times = pktlist[89]+pktlist[88]*256
        self.t451_info_board[cidx].isstaticip = pktlist[95]
        self.t451_info_board[cidx].sip = str(pktlist[96])+"."+str(pktlist[97])+"."+str(pktlist[98])+"."+str(pktlist[99])
        self.t451_info_board[cidx].mask = str(pktlist[100])+"."+str(pktlist[101])+"."+str(pktlist[102])+"."+str(pktlist[103])
        self.t451_info_board[cidx].sip = str(pktlist[104])+"."+str(pktlist[105])+"."+str(pktlist[106])+"."+str(pktlist[107])
        # t451 report是寫死16個的
        for idx in range(16):
            boardidx = 108+idx*64
            self.t451_info_board[cidx].t451_board[idx].card_type = pktlist[boardidx]*256+pktlist[boardidx+1]
            self.t451_info_board[cidx].t451_board[idx].version_pcb = "v"+str(pktlist[boardidx+2]*256+pktlist[boardidx+3])
            self.t451_info_board[cidx].t451_board[idx].version_fw = "v"+str(pktlist[boardidx+4]*256+pktlist[boardidx+5])+"."+str(pktlist[boardidx+6]*256+pktlist[boardidx+7])+"b"+str(pktlist[boardidx+8]*256+pktlist[boardidx+9])
            self.t451_info_board[cidx].t451_board[idx].lock_status = pktlist[boardidx+11]
            self.t451_info_board[cidx].t451_board[idx].serial_num = asciitostr(pktlist[boardidx+12:boardidx+12+20])
            self.t451_info_board[cidx].t451_board[idx].mac = pktlist[boardidx+32:boardidx+32+6]
            self.t451_info_board[cidx].t451_board[idx].temp1 = pktlist[boardidx+38]
            self.t451_info_board[cidx].t451_board[idx].temp2 = pktlist[boardidx+39]
            self.t451_info_board[cidx].t451_board[idx].version_prom = "v"+str(pktlist[boardidx+40]*256+pktlist[boardidx+41])+"."+str(pktlist[boardidx+42]*256+pktlist[boardidx+43])
            self.t451_info_board[cidx].t451_board[idx].datecode_fw = "%02x%02x/%02x/%02x" % (pktlist[boardidx+44], pktlist[boardidx+45], pktlist[boardidx+46], pktlist[boardidx+47])
            self.t451_info_board[cidx].t451_board[idx].version_hw = "v"+str(pktlist[boardidx+48]*256+pktlist[boardidx+49])+"."+str(pktlist[boardidx+50]*256+pktlist[boardidx+51])+"b"+str(pktlist[boardidx+52]*256+pktlist[boardidx+53])
            self.t451_info_board[cidx].t451_board[idx].card_status = pktlist[boardidx+56]
    
    def parse_t451report_lock(self, cidx, pktlist):
        if (pktlist[32]*256+pktlist[33]) == self.client_id: # self lock success
            self.t451_info_board[cidx].t451_board[pktlist[30]].is_lock_success = 1
            self.t451_info_board[cidx].t451_board[pktlist[30]].lock_status = 1
        elif (pktlist[32]*256+pktlist[33]) == 0:
            self.t451_info_board[cidx].t451_board[pktlist[30]].is_lock_success = 0
            self.t451_info_board[cidx].t451_board[pktlist[30]].lock_status = 0
        else:
            self.t451_info_board[cidx].t451_board[pktlist[30]].is_lock_success = 0
            self.t451_info_board[cidx].t451_board[pktlist[30]].lock_status = 2
            
    
    def parse_t451report_sample(self, cidx, pktlist):
        self.log_file.write(3, "(Sample Report) CommandID = 0x90B8")
        bidx = pktlist[30]
        self.t451_info_board[cidx].t451_board[bidx].report.parser_sample(pktlist[32:32+1036]) # 600 bytes counter 

    def parse_t451report_counter(self, cidx, pktlist):
        self.log_file.write(3, "(Counter Report) CommandID = 0x90B9")
        bidx = pktlist[30]
        self.t451_info_board[cidx].t451_board[bidx].report.parser_counter(pktlist[32:32+644]) # 600 bytes counter 

    def parse_t451report_connect(self, cidx, pktlist):
        self.log_file.write(3, "(Connect Report) CommandID = 0x90BA")
        bidx = pktlist[30]
        self.t451_info_board[cidx].t451_board[bidx].report.parser_connect(pktlist[32:32+64])

    def parse_t451report_disconnect(self, cidx, pktlist):
        self.log_file.write(3, "(Disconnect Report) CommandID = 0x90BB")
        bidx = pktlist[30]
        self.t451_info_board[cidx].t451_board[bidx].report.parser_disconnect(pktlist[32:32+20])

    def parse_t451report_overload(self, cidx, pktlist):
        self.log_file.write(3, "(Overload Report) CommandID = 0x90BC")
        bidx = pktlist[30]
        self.t451_info_board[cidx].t451_board[bidx].report.parser_over(pktlist[32:32+12])

    def parse_t451report_underload(self, cidx, pktlist):
        self.log_file.write(3, "(Underload Report) CommandID = 0x90BF")
        bidx = pktlist[30]
        self.t451_info_board[cidx].t451_board[bidx].report.parser_under(pktlist[32:32+12])
            
    def parse_t451report_short(self, cidx, pktlist):
        self.log_file.write(3, "(Short Circuit Report) CommandID = 0x90BD")
        bidx = pktlist[30]
        self.t451_info_board[cidx].t451_board[bidx].report.parser_short(pktlist[32:32+16])

    def parse_t451report_load(self, cidx, pktlist):
        self.log_file.write(3, "(Loading Report) CommandID = 0x90C1")
        bidx = pktlist[30]
        self.t451_info_board[cidx].t451_board[bidx].report.parser_load(pktlist[32:32+24])
    ##############################  </T451 Report Parser>  ##################################
    

    ##############################  <Receive Parser>  ##################################
    # receive parser for T451
    def receive_sock_t451(self):
        try:
            while (self.is_terminate == 0):
                #time.sleep(0.01)
                #lock.acquire()
                data = self.sock_t451.recv(2200)
                if len(data) > 0:
                    s = '!'
                    s +=str(len(data))
                    s += 'B'
                    fields = struct.unpack(s, data)
                    commandID = fields[0]*256+fields[1]
                    self.log_file.write(1, '(SocketT451) CommandID = 0x%02x' % commandID)
                    

                    

                    if commandID == 0x80fd: # get client id and chassis id(MAC)
                        self.parse_t451report_clientid(fields)
                    else:
                        cidx = -1
                        tmpchassis = fields[24:24+6]
                        
                        for idx in range(16):
                            if set(self.t451_info_board[idx].chassis_id) == set(tmpchassis):
                                cidx = idx
                                break
                            else:
                                if set(self.t451_info_board[idx].chassis_id) == set([0,0,0,0,0,0]):
                                    #self.t451_info_board[idx].chassis_id = tmpchassis #20170922, TK, comment
                                    cidx = idx
                                    break
                                elif set(self.t451_info_board[idx].chassis_id) != set([0,0,0,0,0,0]):
                                    continue
                        
                        if cidx != -1:
                            if commandID == 0x80c1: # get port info
                                self.parse_t451report_status_port(cidx, fields)
                            # 20170929, TK, added. 尚未处理board status
                            elif commandID == 0x8010: # board status report
                                self.parse_t451report_lock(cidx, fields)
                            elif commandID == 0x8011: # lock report
                                self.parse_t451report_lock(cidx, fields)
                            elif commandID == 0x80b7:
                                if (fields[12]*256+fields[13]) == 1: # if group success, sub command return 1
                                    self.t451_groupid = fields[23]
                            elif commandID == 0x90b8: #sample report
                                self.parse_t451report_sample(cidx, fields)
                            elif commandID == 0x90b9: #counter report
                                self.parse_t451report_counter(cidx, fields)
                            elif commandID == 0x90ba:
                                self.parse_t451report_connect(cidx, fields)
                            elif commandID == 0x90bb:
                                self.parse_t451report_disconnect(cidx, fields)
                            elif commandID == 0x90bc:
                                self.parse_t451report_overload(cidx, fields)
                            elif commandID == 0x90bd:
                                self.parse_t451report_short(cidx, fields)
                            elif commandID == 0x90bf:
                                self.parse_t451report_underload(cidx, fields)
                            elif commandID == 0x90c1:
                                self.parse_t451report_load(cidx, fields)
                    # self.server_trigger() # T451 do not trigger
                #lock.release()
                # show all stream contets by hex
        except:
            if self.log_file.is_closed() == 0:
                self.log_file.write(-1, '(SocketT451) Exception Error!')
                self.log_file.close()
        finally:
            if self.log_file.is_closed() == 0:
                self.log_file.write(2, '(SocketT451) SocketT451 terminate!')
                # set sock to NULL
                self.sock_t451 = None
    
    # recive parser
    # it's a multithread function, using 'start_new_thread' to create, start from the 'server_connect' function
    def receive_sock1(self):
        try:
            while True:
                #time.sleep(0.01)
                global is_terminate
                if self.is_terminate == 1:
                    break
                #lock.acquire()
                data = self.sock1.recv(2200)
                
                if len(data) > 0:
                    s = '!'
                    s +=str(len(data))
                    s += 'B'
                    fields = struct.unpack(s, data)
                    commandID = fields[0]*256+fields[1]
                    self.log_file.write(1, '(Socket1) CommandID = 0x%02x' % commandID)
                    
                    if commandID == 0x80fe:
                        self.parse_report_status_port(fields)

                    self.server_trigger()
                
                #lock.release()
                # show all stream contets by hex
        
        except Exception as e:
            tmpstr = "Exception type:"+ type(e).__name__
            if self.log_file.is_closed() == 0:
                self.log_file.write(-1, tmpstr)
                self.log_file.write(-1, '(Socket1) Exception Error!')
                #self.log_file.close()
        finally:
            if self.log_file.is_closed() == 0:
                self.log_file.write(2, '(Socket1) Socket1 terminate!')
                # set sock to NULL
                self.sock1 = None        
            
    #def receive_sock2(self, lock):
    def receive_sock2(self):
        try:
            
            #print >>sys.stderr, "Receive data"
            while (self.is_terminate == 0):
                #time.sleep(0.005)
                data = self.sock2.recv(2000)
                #20161003, TK, comment. show length for debug
                #self.log_file.write(1, '(Socket2) CommandLength = %d' % len(data))
                #20160930, TK, added
                #if len(data) > 0:
                if len(data) > 20 and len(data) < 1550:
                    #self.threadlock.acquire()
                    s = '!'
                    s +=str(len(data))
                    s += 'B'
                    fields = struct.unpack(s, data)
                    
                    commandID = fields[0]*256+fields[1]
                    subcmdID = fields[11]
                    chassisID = fields[20]*256+fields[21]
                    #20161012, TK ,added. commandä¸­æåºpacketlengthï¼è¿æ¯700ææ°å¢ç
                    pktlen = fields[12]*256+fields[13]

                    self.log_file.write(1, '(Socket2) CommandID = 0x%04x' % commandID)
                    #print('(Socket2) CommandID = 0x%04x' % commandID)
                    #20160908, check ack
                    if commandID == self.ns_cmd_ack.ack_cmd and self.ns_cmd_ack.chassis_id == chassisID and self.ns_cmd_ack.board_id == fields[22] and self.ns_cmd_ack.port_id == fields[23]:
                        self.ns_cmd_ack.is_ack = 1
                    
                    if commandID == 0x80fe:
                        self.parse_report_status_port(fields)
                        
                    # Port Counter Report. if cmdid and sub cmdid is correct. length is 1472, and is locked
                    #elif commandID == 0x100 and subcmdID == 0 and len(data) == 1472 and self.is_locked == 1:
                    elif commandID == 0x100 and subcmdID == 0 and len(data) > 1400 and self.is_locked == 1:
                        if self.is_stoptest == 0:
                            self.parse_report_port(fields)
                    # capture report
                    elif commandID == 0x200:
                        self.parse_report_capture(fields)
                    # Tx End Report
                    elif commandID == 0x300:
                        self.parse_report_txend(fields)
                    elif commandID == 0x500:
                        self.parse_report_status_board(fields)
                    elif commandID == 0x1e00:
                        self.parse_report_eeprom(fields)
                    elif commandID == 0x80fc:
                        self.parse_report_status_link(fields)
                    elif commandID == 0xe00:
                        self.parse_report_status_lock(fields)
                    # subcommand id = 0 means ping report, =1 means dhcp report
                    elif commandID == 0x700 and subcmdID == 0:
                        self.parse_report_ping(fields)
                    elif commandID == 0x700 and subcmdID == 1:
                        self.parse_report_dhcp(fields)
                    elif commandID == 0x1500 and self.is_locked == 1:
                        if self.is_stoptest == 0:
                            self.parse_report_stream(fields)
                    elif commandID == 0x1300:
                        tmpts = fields[24]*16777216 + fields[25] * 65536 + fields[26] * 256 + fields[27]
                        tmpts_sec = 0
                        if self.nicrpt_counter == 0:
                            self.nicrpt_ts = tmpts
                            tmpts_sec = 0
                        else:
                            # /2.5 means microsecond. /1000 means millisecond
                            tmpts_sec = ((tmpts - self.nicrpt_ts)/2.5)/1000
                            self.nicrpt_ts = tmpts
                        if tmpts_sec > 100:
                            print("     report ts = %.3f" % (tmpts_sec))
                        self.nicrpt_counter = self.nicrpt_counter + 1
                    elif commandID == 0x1900:
                        self.parse_report_status_power(fields)
                    #self.threadlock.release()
                    # always send server_trigger cmd to trig server response
                    self.server_trigger() #20170808, TK, comment. try to command
                    
                
        except:
            if self.log_file.is_closed() == 0:
                self.log_file.write(-1, '(Socket2) Exception Error!')
                self.log_file.close()
        finally:
            #if self.log_file.closed == False:
            if self.log_file.is_closed() == 0:
                self.log_file.write(2, '(Socket2) Socket2 terminate!')
                # set sock to NULL
                self.sock2 = None
    ##############################  </Receive Parser>  ##################################
