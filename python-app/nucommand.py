import struct

##################################################     T451 Command     #########################################################
class T451CommandHeader:
    def __init__(self, cmdID, clientID, seq, subID):
        self.command_id = cmdID
        self.client_id = clientID
        self.sequence_num = seq
        self.fragment = 0
        self.card_type = 0xE001 #card type是固定的
        self.sub_command_id = subID
        self.check_id = 0
        self.reserved = [0]*7
        self.group_id = 0xff
    def get_payload(self):
        return struct.pack("!HHI4H7BB", self.command_id, self.client_id, self.sequence_num, self.fragment, self.card_type, self.sub_command_id, self.check_id,
                           self.reserved[0], self.reserved[1], self.reserved[2], self.reserved[3], self.reserved[4], self.reserved[5], self.reserved[6], self.group_id)

class T451CommandSimple:
    def __init__(self, cid, bid, pid, param1, param2):
        self.chassis_id = [0xff]*6
        for idx in range(6):
            self.chassis_id[idx] = cid[idx]
        self.board_id = bid
        self.port_id = pid
        self.param1 = param1
        self.param2 = param2
    def get_payload(self):
        return struct.pack("!6B2B2I", self.chassis_id[0], self.chassis_id[1], self.chassis_id[2], self.chassis_id[3], self.chassis_id[4], self.chassis_id[5], self.board_id, self.port_id, self.param1, self.param2)

class T451CommandACK:
    def __init__(self):
        self.chassis_id = [0xff]*6
        self.board_id = 1
        self.port_id = 1
        self.ack_cmd = 0x80ff
        self.is_ack = 0

class T451CommandAllConfig:
    def __init__(self):
        self.chassis_id = [0xff]*6
        self.board_id = 1
        self.port_id = 1
        self.poeclass = 0
        self.duttype = 0
        self.alternative = 0
        self.cabletype = 1
        self.cablelen = 1
        self.copperloss = 0
        self.poweralert = 1
        self.overheadthr = 70
        self.overheadalert = 1
        self.reporttype = 3
        self.voltpoweron = 4800
        self.voltpoweroff = 500
        self.voltpowergood = 3600
        self.voltpowerunder = 3500
        self.voltpowertoohigh = 5700
        self.lldpenable= 0
        self.lldploadingfirst  = 0
        self.lldpreportloading = 1500
        self.lldpflag = 2
        self.lldpinterval = 5000
        self.conn_loadingflag = 0xf
        self.conn_timeout = 0x2710
        self.conn_waittime = 0x3e8
        self.over_power = 0x1388
        self.over_timeout = 0xbb8
        self.under_power = 0x3e8
        self.under_timeout = 0xbb8 # 3000ms
        self.short_timeout = 0xbb8
        self.disconn_timeout = 0xbb8
        self.load_mode = 4
        self.load_minpower = 1
        self.load_maxpower = 0xc350
        self.load_delay = [0]*64
        self.load_normalpower = [0]*64
    def get_payload(self):
        oripayload = struct.pack("!6B2B20I10QI12I", self.chassis_id[0], self.chassis_id[1], self.chassis_id[2], self.chassis_id[3], self.chassis_id[4], self.chassis_id[5], self.board_id, self.port_id, 
                           self.poeclass, self.duttype, self.alternative, self.cabletype, self.cablelen, self.copperloss, self.poweralert, self.overheadthr, self.overheadalert, self.reporttype, 
                           self.voltpoweron, self.voltpoweroff, self.voltpowergood, self.voltpowerunder, self.voltpowertoohigh, self.lldpenable, self.lldploadingfirst, self.lldpreportloading, 
                           self.lldpflag, self.lldpinterval, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, self.conn_loadingflag, self.conn_timeout, self.conn_waittime, self.over_power, self.over_timeout, 
                           self.under_power, self.under_timeout, self.short_timeout, self.disconn_timeout, self.load_mode, self.load_minpower, self.load_maxpower)
        for idx in range(64):
            oripayload = oripayload + struct.pack("!2I", self.load_delay[idx], self.load_normalpower[idx])
        return oripayload

#################################################################################################################################

class NuStreamsCommandHeader:
    def __init__(self, cmdID, clientID, seq, subID, cardtype):
        self.command_id = cmdID
        self.client_id = clientID
        self.sequence_num = seq
        self.card_type = cardtype
        self.sub_command_id = subID
        self.group_id = 0
        self.check_id = 0
        self.reserved = [0]*7
    def get_payload(self):
        return struct.pack("!HHIHH7BB", self.command_id, self.client_id, self.sequence_num, self.card_type, self.sub_command_id, 
                           self.reserved[0], self.reserved[1], self.reserved[2], self.reserved[3], self.reserved[4], self.reserved[5], self.reserved[6], self.group_id)
        #return struct.pack("!HHIHH7sBI", self.command_id, self.client_id, self.sequence_num, self.card_type, self.sub_command_id, self.reserved1, self.group_id, self.check_id);

class NuStreamsCommandSimple:
    def __init__(self, cid, bid, pid):
        self.chassis_id = cid
        self.board_id = bid
        self.port_id = pid
        self.my_id = cid
    def get_payload(self):
        return struct.pack("!H2BH", self.chassis_id, self.board_id, self.port_id, self.my_id)

class NuStreamsCommandMediaChange:
    def __init__(self, cid, bid, pid):
        self.chassis_id = cid
        self.board_id = bid
        self.port_id = pid
        # media type
        self.media_type = 0xb
        # media capability
        self.capability = 127
        # master slave setting
        self.master_slave = 0
        # my chassis id
        self.my_chassis = 0
        # power change delay
        self.power_delay = 300
    def get_payload(self):
        return struct.pack("!H2B5H", self.chassis_id, self.board_id, self.port_id, self.media_type, self.capability, self.master_slave , self.my_chassis, self.power_delay)

class NuStreamsCommandAddEntry:
    def __init__(self):
        self.chassis_id = 0
        self.board_id = 2
        self.port_id = 1
        self.entry_index = 0
        self.interburst_gap = 96
        self.frame_gap = 96
        #The burst count. 0 for random burst.
        self.loop_cnt = 1
        #Tx Max Bytes per second
        self.rate_ctrl = 0x7fffffff
        #User define payload data.       
        self.payload_patn = 0
        #Payload mode.
        # 0x0: All 0, 
        # 0x1: 0x55, 
        # 0x2: Byte Increase, 
        # 0x3: Byte Decrease, 
        # 0x4: Word Increase, 
        # 0x5: Word Decrease, 
        # 0x6: 0x55AA, 
        # 0x7: 0x5555AAAA, 
        # 0xE: Random, 
        # 0xF: All 1.
        self.payload_ctrl = 0
        # Payload position.  0: Disable, 1: start from 65 Byte, 2: start from 18 Byte. if disable, the packet contents are not clear after 64 bytes(duplicate payload)
        self.payload_pos = 1
        # Enable XTAG in Tx stream packet. 0: Disable, 1: Enable.
        self.enable_Xtag = 1
        # Add CRC at the end of packet. 0: Disable, 1: Enable.
        self.add_crc = 1
        self.add_error_crc = 0
        self.random_len = 0
        self.packet_len = 60
        self.next_index = 0
        # Add null entry. 0: Disable, 1: Enable.
        self.null_entry = 0
        # A unique XTAG Stream Number. 
        self.stream_id = 0
        # X-TAG Orient Serial Number, increased by 1 in each packet during transmission. Used to identify the sequence.
        self.xtag_orient_sn = 0
        # DIP variation mode. Only for RM731/891. 0: Disabled, 1: Increase Mode, 2: Decrease Mode, 3: Random Mode
        self.vary_mode_dip = 0
        self.vary_mode_sip = 0
        self.vary_mode_da = 0
        self.vary_mode_sa = 0
        self.vary_mode_vid = 0
        self.vary_limit_dip = 255
        self.vary_limit_sip = 255
        self.vary_limit_da = 255
        self.vary_limit_sa = 255
        self.vary_limit_vid = 255
        self.vary_delta_dip = 1
        self.vary_delta_sip = 1
        self.vary_delta_da = 1
        self.vary_delta_sa = 1
        self.vary_delta_vid = 1
        # The length of header data, less than 64 bytes.
        self.header_len = 46
        self.length_mode = 0
        self.length_step_no = 0
        self.length_start = 0
        self.length_step = [0] * 8
        self.enable_vlan = 0
        self.enable_qinq = 0
        self.enable_ipv4 = 0
        self.reset_ipchksum = 0
        self.__user_pad_patn = [0]*1058
    
    def set_udf_payload(self, pktlist):
        idx = 0
        total_len = len(pktlist)
        if total_len > 1024:
            total_len = 1024
        # first 32 bytes are reserved, and the next 2 byte is my_chassis_id
        while idx < total_len:
            self.__user_pad_patn[idx+34] = pktlist[idx]
            idx += 1

    
    def get_payload(self):
        return struct.pack("!HBB5I28H2BH8H4H1058B", self.chassis_id, self.board_id, self.port_id, self.entry_index, self.interburst_gap, self.frame_gap, self.loop_cnt, self.rate_ctrl,
                           self.payload_patn, self.payload_ctrl, self.payload_pos, self.enable_Xtag, self.add_crc, self.add_error_crc, self.random_len, self.packet_len, self.next_index,
                           self.null_entry, self.stream_id, self.xtag_orient_sn,
                           self.vary_mode_dip, self.vary_mode_sip, self.vary_mode_da, self.vary_mode_sa, self.vary_mode_vid,
                           self.vary_limit_dip, self.vary_limit_sip, self.vary_limit_da, self.vary_limit_sa, self.vary_limit_vid,
                           self.vary_delta_dip, self.vary_delta_sip, self.vary_delta_da, self.vary_delta_sa, self.vary_delta_vid,
                           self.header_len, self.length_mode, self.length_step_no, self.length_start,
                           self.length_step[0], self.length_step[1], self.length_step[2], self.length_step[3], self.length_step[4], self.length_step[5], self.length_step[6], self.length_step[7],
                           self.enable_vlan, self.enable_qinq, self.enable_ipv4, self.reset_ipchksum, *self.__user_pad_patn)

class NuStreamsCommandPortConfig:
    def __init__(self, cid, bid, pid):
        self.chassis_id = cid
        self.board_id = bid
        self.port_id = pid
        # led 1~4 data / blink(Q)
        self.led_data = 0xffffffffffffffff
        # enable tx
        self.enable_tx = 1
        # enable tx flow control
        self.enable_txfc = 0
        # enable rx
        self.enable_rx = 1
        # enable rx flow control
        self.enable_rxfc = 0
        # reset phy, polling phy, mac mode, link media
        self.reset_phy = 0x0000000100000000
        
        # 20250326, modifiy tk. ignore auto_mdix
        # enable automdix
        self.auto_mdix = 0x0000ffff
        # rx max bit
        self.max_rx_bit = 0x7fffffff
        self.bc_mode = 0xffff0000
        # tx/tx xtag offset
        self.xtag_offset_rx = 0
        self.xtag_offset_tx = 0
        # host, ts, di
        self.host_cnt = 0xffffffffffffffff
        self.di_xtag = 0xffff
        # 
        self.enable_dic = 0x000000ff
        self.reserve1 = 0xffffffffffffffff
        self.reserve2 = 0xffffffffffffffff
        self.my_chassis_id = 0xfffe
    def get_payload(self):
        return struct.pack("!H2BQ4HQ3I2HQHI2QH", self.chassis_id, self.board_id, self.port_id, self.led_data, self.enable_tx, self.enable_txfc ,self.enable_rx, self.enable_rxfc, 
                           self.reset_phy, self.auto_mdix, self.max_rx_bit, self.bc_mode, self.xtag_offset_rx, self.xtag_offset_tx, self.host_cnt, self.di_xtag, self.enable_dic, self.reserve1, self.reserve2, self.my_chassis_id)

class NuStreamsCommandStartTx:
    def __init__(self, cid, bid, pid):
        self.chassis_id = cid
        self.board_id = bid
        self.port_id = pid
        # begin entry index
        self.entryidx_begin = 0
        # end entry index
        self.entryidx_end = 0
        # total transmit packet
        self.total_pkts = [1000]*64
        # The interval of counter report.
        self.interval = 1
        # 1 means transmit immediatly, 0 means wait for a global transmit command
        self.immediate_tx = 1
    def get_payload(self, pidx):
        return struct.pack("!H2B2HQI3H", self.chassis_id, self.board_id, self.port_id, self.entryidx_begin, self.entryidx_end, self.total_pkts[pidx] , 0, self.interval, self.immediate_tx, 0)

class NuStreamsCommandGlobalStartTx:
    def __init__(self, cid, bid, pid):
        self.chassis_id = cid
        self.board_id = bid
        self.port_id = pid
        # �?Chassis ID for CMD? field is reserved for future use. Setting to cid.
        self.chassis_cmd = cid
        # Tells which ports are infected by this global command. 8 bytes represents 64 ports on a 2000i chassis. 
        self.global_map_1 = 0
        self.global_map_2 = 0
        self.global_map_3 = 0
        self.global_map_4 = 0
        # type = 0 means 600i/700(map for 32bit), type = 1 means 2000i(map for 64bit), 900i
        self.module_type = 0
    def get_payload(self):
        if self.module_type == 0:
            return struct.pack("!H2B2I", self.chassis_id, self.board_id, self.port_id, self.chassis_cmd, self.global_map_1)
        else:
            return struct.pack("!H2B5I", self.chassis_id, self.board_id, self.port_id, self.chassis_cmd, self.global_map_1, self.global_map_2, self.global_map_3, self.global_map_4)

# 20230619, TK, added for Global Power
class NuStreamsCommandGlobalPower:
    def __init__(self, cid, bid, pid):
        self.chassis_id = cid
        self.board_id = bid
        self.port_id = pid
        self.power_map = [0]*4
        
        
    def get_payload(self):
        return struct.pack("!H6B", self.chassis_id, self.board_id, self.port_id, self.power_map[0], self.power_map[1], self.power_map[2], self.power_map[3])
        

class NuStreamsCommandRxConfig:    
    def __init__(self, cid, bid, pid):
        self.chassis_id = cid
        self.board_id = bid
        self.port_id = pid
        self.base_id0 = 1
        self.base_id1 = 0
        
        #20161013, TK, modified. using 1 �?map
        #20160930, TK, added. for mapping �?stream counter
        '''
        self.stream_map_tx0 = [0xff]*8
        self.stream_map_tx0[4] = 0
        self.stream_map_tx0[5] = 0
        self.stream_map_tx0[6] = 0
        self.stream_map_tx0[7] = 0
        # 56 bytes = 8 bytes * 7
        self.stream_map_tx1 = [0]*7
        '''
        self.stream_map_tx = [0]*8
        self.stream_map_tx[0] = 0xffffffff00000000
        '''
        self.stream_map_rx0 = [0xff]*8
        self.stream_map_rx0[4] = 0
        self.stream_map_rx0[5] = 0
        self.stream_map_rx0[6] = 0
        self.stream_map_rx0[7] = 0
        # 56 bytes = 8 bytes * 7
        self.stream_map_rx1 = [0]*7
        '''
        self.stream_map_rx = [0]*8
        self.stream_map_rx[0] = 0xffffffff00000000

        # 512 bytes = 8 bytes * 64
        self.stream_map_rx_ext = [0]*64
        # 14 means XTAG
        self.stream_type_rx = 14
        # 5 under are 1 byte
        self.stream_type_rx_ext = 0
        self.mode_jitter0 = 0
        self.mode_jitter1 = 0
        self.mode_latency = 0
        # 2 bytes
        self.reserved = 0
    def get_payload(self):
        # using integrade map
        '''
        return struct.pack("!H2B2I8B7Q8B7Q64Q6B", self.chassis_id, self.board_id, self.port_id, self.base_id0, self.base_id1, 
                           self.stream_map_tx0[0], self.stream_map_tx0[1], self.stream_map_tx0[2], self.stream_map_tx0[3],
                           self.stream_map_tx0[4], self.stream_map_tx0[5], self.stream_map_tx0[6], self.stream_map_tx0[7],
                           self.stream_map_tx1[0], self.stream_map_tx1[1], self.stream_map_tx1[2], self.stream_map_tx1[3], 
                           self.stream_map_tx1[4], self.stream_map_tx1[5], self.stream_map_tx1[6],
                           self.stream_map_rx0[0], self.stream_map_rx0[1], self.stream_map_rx0[2], self.stream_map_rx0[3], 
                           self.stream_map_rx0[4], self.stream_map_rx0[5], self.stream_map_rx0[6], self.stream_map_rx0[7], 
                           self.stream_map_rx1[0], self.stream_map_rx1[1], self.stream_map_rx1[2], self.stream_map_rx1[3], 
                           self.stream_map_rx1[4], self.stream_map_rx1[5], self.stream_map_rx1[6],
                           self.stream_map_rx_ext[0], self.stream_map_rx_ext[1], self.stream_map_rx_ext[2], self.stream_map_rx_ext[3], 
                           self.stream_map_rx_ext[4], self.stream_map_rx_ext[5], self.stream_map_rx_ext[6], self.stream_map_rx_ext[7], 
                           self.stream_map_rx_ext[8], self.stream_map_rx_ext[9], self.stream_map_rx_ext[10], self.stream_map_rx_ext[11], 
                           self.stream_map_rx_ext[12], self.stream_map_rx_ext[13], self.stream_map_rx_ext[14], self.stream_map_rx_ext[15], 
                           self.stream_map_rx_ext[16], self.stream_map_rx_ext[17], self.stream_map_rx_ext[18], self.stream_map_rx_ext[19], 
                           self.stream_map_rx_ext[20], self.stream_map_rx_ext[21], self.stream_map_rx_ext[22], self.stream_map_rx_ext[23], 
                           self.stream_map_rx_ext[24], self.stream_map_rx_ext[25], self.stream_map_rx_ext[26], self.stream_map_rx_ext[27], 
                           self.stream_map_rx_ext[28], self.stream_map_rx_ext[29], self.stream_map_rx_ext[30], self.stream_map_rx_ext[31], 
                           self.stream_map_rx_ext[32], self.stream_map_rx_ext[33], self.stream_map_rx_ext[34], self.stream_map_rx_ext[35], 
                           self.stream_map_rx_ext[36], self.stream_map_rx_ext[37], self.stream_map_rx_ext[38], self.stream_map_rx_ext[39], 
                           self.stream_map_rx_ext[40], self.stream_map_rx_ext[41], self.stream_map_rx_ext[42], self.stream_map_rx_ext[43], 
                           self.stream_map_rx_ext[44], self.stream_map_rx_ext[45], self.stream_map_rx_ext[46], self.stream_map_rx_ext[47], 
                           self.stream_map_rx_ext[48], self.stream_map_rx_ext[49], self.stream_map_rx_ext[50], self.stream_map_rx_ext[51], 
                           self.stream_map_rx_ext[52], self.stream_map_rx_ext[53], self.stream_map_rx_ext[54], self.stream_map_rx_ext[55], 
                           self.stream_map_rx_ext[56], self.stream_map_rx_ext[57], self.stream_map_rx_ext[58], self.stream_map_rx_ext[59], 
                           self.stream_map_rx_ext[60], self.stream_map_rx_ext[61], self.stream_map_rx_ext[62], self.stream_map_rx_ext[63],                           
                           self.stream_type_rx, self.stream_type_rx_ext, self.mode_jitter0, self.mode_jitter1, self.mode_latency, self.reserved)
        '''    
        return struct.pack("!H2B2I8Q8Q64Q6B", self.chassis_id, self.board_id, self.port_id, self.base_id0, self.base_id1, 
                           self.stream_map_tx[0], self.stream_map_tx[1], self.stream_map_tx[2], self.stream_map_tx[3],
                           self.stream_map_tx[4], self.stream_map_tx[5], self.stream_map_tx[6], self.stream_map_tx[7],
                           self.stream_map_rx[0], self.stream_map_rx[1], self.stream_map_rx[2], self.stream_map_rx[3], 
                           self.stream_map_rx[4], self.stream_map_rx[5], self.stream_map_rx[6], self.stream_map_rx[7], 
                           self.stream_map_rx_ext[0], self.stream_map_rx_ext[1], self.stream_map_rx_ext[2], self.stream_map_rx_ext[3], 
                           self.stream_map_rx_ext[4], self.stream_map_rx_ext[5], self.stream_map_rx_ext[6], self.stream_map_rx_ext[7], 
                           self.stream_map_rx_ext[8], self.stream_map_rx_ext[9], self.stream_map_rx_ext[10], self.stream_map_rx_ext[11], 
                           self.stream_map_rx_ext[12], self.stream_map_rx_ext[13], self.stream_map_rx_ext[14], self.stream_map_rx_ext[15], 
                           self.stream_map_rx_ext[16], self.stream_map_rx_ext[17], self.stream_map_rx_ext[18], self.stream_map_rx_ext[19], 
                           self.stream_map_rx_ext[20], self.stream_map_rx_ext[21], self.stream_map_rx_ext[22], self.stream_map_rx_ext[23], 
                           self.stream_map_rx_ext[24], self.stream_map_rx_ext[25], self.stream_map_rx_ext[26], self.stream_map_rx_ext[27], 
                           self.stream_map_rx_ext[28], self.stream_map_rx_ext[29], self.stream_map_rx_ext[30], self.stream_map_rx_ext[31], 
                           self.stream_map_rx_ext[32], self.stream_map_rx_ext[33], self.stream_map_rx_ext[34], self.stream_map_rx_ext[35], 
                           self.stream_map_rx_ext[36], self.stream_map_rx_ext[37], self.stream_map_rx_ext[38], self.stream_map_rx_ext[39], 
                           self.stream_map_rx_ext[40], self.stream_map_rx_ext[41], self.stream_map_rx_ext[42], self.stream_map_rx_ext[43], 
                           self.stream_map_rx_ext[44], self.stream_map_rx_ext[45], self.stream_map_rx_ext[46], self.stream_map_rx_ext[47], 
                           self.stream_map_rx_ext[48], self.stream_map_rx_ext[49], self.stream_map_rx_ext[50], self.stream_map_rx_ext[51], 
                           self.stream_map_rx_ext[52], self.stream_map_rx_ext[53], self.stream_map_rx_ext[54], self.stream_map_rx_ext[55], 
                           self.stream_map_rx_ext[56], self.stream_map_rx_ext[57], self.stream_map_rx_ext[58], self.stream_map_rx_ext[59], 
                           self.stream_map_rx_ext[60], self.stream_map_rx_ext[61], self.stream_map_rx_ext[62], self.stream_map_rx_ext[63],                           
                           self.stream_type_rx, self.stream_type_rx_ext, self.mode_jitter0, self.mode_jitter1, self.mode_latency, self.reserved)

class NuStreamsCommandOneIPConfig:
    def __init__(self):
        self.mymac = [0]*6
        self.vlan = 0
        self.vlan2 = 0
        self.ip_src = [0]*4
        self.ip_gateway = [0]*4
        self.ipv6_src = [0]*16
        self.ipv6_gateway = [0]*16
        self.maskv4 = 24
        self.maskv6 = 64
        self.configbit = 0x800
    def get_payload(self):
        return struct.pack("!6B2I4B4B16B16B2BH", self.mymac[0], self.mymac[1], self.mymac[2], self.mymac[3], self.mymac[4], self.mymac[5], 
                           self.vlan, self.vlan2, self.ip_src[0], self.ip_src[1], self.ip_src[2], self.ip_src[3], self.ip_gateway[0], self.ip_gateway[1], self.ip_gateway[2], self.ip_gateway[3], 
                           self.ipv6_src[0], self.ipv6_src[1], self.ipv6_src[2], self.ipv6_src[3], self.ipv6_src[4], self.ipv6_src[5], self.ipv6_src[6], self.ipv6_src[7], 
                           self.ipv6_src[8], self.ipv6_src[9], self.ipv6_src[10], self.ipv6_src[11], self.ipv6_src[12], self.ipv6_src[13], self.ipv6_src[14], self.ipv6_src[15], 
                           self.ipv6_gateway[0], self.ipv6_gateway[1], self.ipv6_gateway[2], self.ipv6_gateway[3], self.ipv6_gateway[4], self.ipv6_gateway[5], self.ipv6_gateway[6], self.ipv6_gateway[7], 
                           self.ipv6_gateway[8], self.ipv6_gateway[9], self.ipv6_gateway[10], self.ipv6_gateway[11], self.ipv6_gateway[12], self.ipv6_gateway[13], self.ipv6_gateway[14], self.ipv6_gateway[15], 
                           self.maskv4, self.maskv6, self.configbit)

class NuStreamsCommandARPReplyStart:
    def __init__(self, cid, bid, pid):
        self.chassis_id = cid
        self.board_id = bid
        self.port_id = pid
        self.usermap = 0x01010001
        self.nodeidx = 0
        self.nodenum = 24
        self.arpnode = []
        for idx in range(24):
            self.arpnode.append(NuStreamsCommandOneIPConfig())
    def get_payload(self):
        stream = struct.pack("!H2BI2H", self.chassis_id, self.board_id, self.port_id, self.usermap, self.nodeidx, self.nodenum)
        for idx in range(24):
            stream += self.arpnode[idx].get_payload()
        return stream

class NuStreamsCommandPingv4:
    def __init__(self, cid, bid, pid):
        self.chassis_id = cid
        self.board_id = bid
        self.port_id = pid
        self.ip_dest = [0]*4
        self.ip_src = [0]*4
        self.ip_gateway = [0]*4
        self.num_arp = 1
        self.num_ping = 4
        self.pkt_size = 60
        self.timeout = 1500
        self.interval = 2000
        self.is_config = 0
        self.mask = 24
        self.mymac = [0]*6
        self.myid = 0xffee
    def get_payload(self):
        return struct.pack("!H2B4B4B4B2H3I2H6BH", self.chassis_id, self.board_id, self.port_id, self.ip_dest[0], self.ip_dest[1], self.ip_dest[2], self.ip_dest[3],
                           self.ip_src[0], self.ip_src[1], self.ip_src[2], self.ip_src[3], self.ip_gateway[0], self.ip_gateway[1], self.ip_gateway[2], self.ip_gateway[3],
                           self.num_arp, self.num_ping, self.pkt_size, self.timeout, self.interval, self.is_config, self.mask, 
                           self.mymac[0], self.mymac[1], self.mymac[2], self.mymac[3], self.mymac[4], self.mymac[5], self.myid)

class NuStreamsCommandPingv6:
    def __init__(self, cid, bid, pid):
        self.chassis_id = cid
        self.board_id = bid
        self.port_id = pid
        self.ip_dest = [0]*16
        self.ip_src = [0]*16
        self.ip_gateway = [0]*16
        self.num_ndp = 0
        self.num_ndp2 = 0
        self.num_ping = 4
        self.pkt_size = 60
        self.timeout = 1500
        self.interval = 2000
        self.is_send = 1
        self.mask = 0xffff
        self.mymac = [0]*6
    def get_payload(self):
        return struct.pack("!H2B16B16B16B2H4I2H6B", self.chassis_id, self.board_id, self.port_id, 
                           self.ip_dest[0], self.ip_dest[1], self.ip_dest[2], self.ip_dest[3], self.ip_dest[4], self.ip_dest[5], self.ip_dest[6], self.ip_dest[7], 
                           self.ip_dest[8], self.ip_dest[9], self.ip_dest[10], self.ip_dest[11], self.ip_dest[12], self.ip_dest[13], self.ip_dest[14], self.ip_dest[15], 
                           self.ip_src[0], self.ip_src[1], self.ip_src[2], self.ip_src[3], self.ip_src[4], self.ip_src[5], self.ip_src[6], self.ip_src[7], 
                           self.ip_src[8], self.ip_src[9], self.ip_src[10], self.ip_src[11], self.ip_src[12], self.ip_src[13], self.ip_src[14], self.ip_src[15], 
                           self.ip_gateway[0], self.ip_gateway[1], self.ip_gateway[2], self.ip_gateway[3], self.ip_gateway[4], self.ip_gateway[5], self.ip_gateway[6], self.ip_gateway[7],
                           self.ip_gateway[8], self.ip_gateway[9], self.ip_gateway[10], self.ip_gateway[11], self.ip_gateway[12], self.ip_gateway[13], self.ip_gateway[14], self.ip_gateway[15],
                           self.num_ndp, self.num_ndp2, self.num_ping, self.pkt_size, self.timeout, self.interval, self.is_send, self.mask, 
                           self.mymac[0], self.mymac[1], self.mymac[2], self.mymac[3], self.mymac[4], self.mymac[5])

class NuStreamsCommandNICSet:
    def __init__(self, cid, bid, pid):
        self.chassis_id = cid
        self.board_id = bid
        self.port_id = pid
        self.rx_mode0 = 2
        self.rx_mode1 = 2
        self.tx_preamble = 8
        self.tx_ifg = 96
        self.mac_low = [0]*6
        self.reserved = 0xffff
        self.mac_high = [0]*6
        self.mac_mode = 0
        self.map = [1]*8
    def get_payload(self):
        return struct.pack("!H2B2BHI6BH6BB8B", self.chassis_id, self.board_id, self.port_id, self.rx_mode0, self.rx_mode1, self.tx_preamble, self.tx_ifg, 
                           self.mac_low[0], self.mac_low[1], self.mac_low[2], self.mac_low[3], self.mac_low[4], self.mac_low[5], self.reserved, 
                           self.mac_high[0], self.mac_high[1], self.mac_high[2], self.mac_high[3], self.mac_high[4], self.mac_high[5], self.mac_mode, 
                           self.map[0], self.map[1], self.map[2], self.map[3], self.map[4], self.map[5], self.map[6], self.map[7])

class NuStreamsCommandNICSend:
    def __init__(self, cid, bid, pid):
        self.chassis_id = cid
        self.board_id = bid
        self.port_id = pid
        self.pktlen = 60
        self.reserved = 0xffff
        self.pktdata = [0]*1024
    
    def set_pkt_data(self, pktlist):
        idx = 0
        total_len = len(pktlist)
        if total_len > 1024:
            total_len = 1024
        # first 32 bytes are reserved, and the next 2 byte is my_chassis_id
        while idx < total_len:
            self.pktdata[idx] = pktlist[idx]
            idx += 1

    def get_payload(self):
        return struct.pack("!H2B2H1024B", self.chassis_id, self.board_id, self.port_id, self.pktlen, self.reserved, *self.pktdata)

class NuStreamsCommandDHCPConfig:
    def __init__(self, cid, bid, pid):
        self.chassis_id = cid
        self.board_id = bid
        self.port_id = pid
        self.timeout_discover = 5000
        self.timeout_ack = 5000
        self.delay_decline = 1000
        self.delay_ack = 1000
        self.mymac = [0]*6
        self.reserved = 0xffff
        self.mode_selectip = 0
        self.vary_mymac = 0 # fix
        self.vary_ip = 0 # fix
        self.vary_host = 0 # fix
        self.hostname = [0]*256

    def get_payload(self):
        return struct.pack("!H2B4I6B5H256B", self.chassis_id, self.board_id, self.port_id, self.timeout_discover, self.timeout_ack, self.delay_decline, self.delay_ack,
                           self.mymac[0], self.mymac[1], self.mymac[2], self.mymac[3], self.mymac[4], self.mymac[5], 
                           self.reserved, self.mode_selectip, self.vary_mymac, self.vary_ip, self.vary_host, 
                           *self.hostname)

class NuStreamsCommandACK:
    def __init__(self):
        self.chassis_id = 0
        self.board_id = 1
        self.port_id = 1
        self.ack_cmd = 0x80ff
        self.is_ack = 0