class NuStreamsConst:
    def __init__(self):

        self.ENABLE = 1
        self.DISABLE = 0

        # topology
        self.TOPOLOGY_ONETOONE = 0
        self.TOPOLOGY_NTOM = 1
        self.TOPOLOGY_FULLYMESH = 2
        self.TOPOLOGY_ROTATE = 3

        # direction
        self.DIRECTION_UNI = 0
        self.DIRECTION_BI = 1

        # search mode
        self.SEARCH_MODE_STEP = 0
        self.SEARCH_MODE_BISECTION = 1

        
        # error type
        self.ERROR_NO = 0
        self.ERROR_CRC = 1
        self.ERROR_DRIBBLE = 2
        self.ERROR_ALIGN = 3
        #self.ERROR_OVER = 0x00000100
        #self.ERROR_UNDER = 0x00001000
        

        # port config index
        ridx = 24
        self.IDX_PORTCOUNTER_RX_BORADCAST = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_MULTICAST = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_UNICAST = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_PAUSE = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_VLAN = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_IPV4 = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_ERR_DRIBBLE = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_ERR_ALIGN = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_ERR_CRC = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_UNDERSIZE = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_OVERSIZE = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_GOODPKT = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_ERR_DI = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_ERR_IPCHKSUM = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_64 = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_65_127 = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_128_255 = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_256_511 = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_512_1023 = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_1024_1522 = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_CAPTURE = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_HOSTQUEFULL = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_ICMP = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_ARP = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_ERR_FRAGMENT = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_ERR_TCPCHKSUM = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_ERR_UDPCHKSUM = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_IPV4FRAGMENT = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_IPV4EXTENSION = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_XTAG = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_GAPOVER12 = ridx
        # For SDFR
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_DA = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_SA = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_VID = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_VID_QINQ = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_MPLS = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_SIP = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_DIP = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_SP = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_DP = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_XTAG = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_UDF = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_MAC = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_APMPT = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_DA2 = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_SA2 = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_VID2 = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_SIPV6 = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_DIPV6 = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_IPV6 = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_ICMPV6 = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_SDFR_IGMP = ridx
        ridx += 8        
        self.IDX_PORTCOUNTER_RTP = ridx
        ridx += 8
        # ridx += 184 # if no SDFR
        self.IDX_PORTCOUNTER_RX_BYTE = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_RX_RATE_BYTE = ridx
        ridx += 4
        self.IDX_PORTCOUNTER_RX_RATE_PKT = ridx
        ridx += 12
        self.IDX_PORTCOUNTER_RX_BERT_ERR = ridx
        # reserved, byte array
        ridx += 452
        self.IDX_PORTCOUNTER_TX_PKT = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_TX_COL = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_TX_COL_MULTI = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_TX_COL_LATE = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_TX_PAUSEPACKET = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_TX_BYTE = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_TX_COL_TOTAL = ridx
        ridx += 8
        self.IDX_PORTCOUNTER_TX_RATE_BYTE = ridx
        ridx += 4
        self.IDX_PORTCOUNTER_TX_RATE_PKT = ridx
        ridx += 340 
        self.IDX_PORTCOUNTER_TX_ARP_REPLY = ridx
        ridx += 4
        self.IDX_PORTCOUNTER_TX_ARP_REQUEST = ridx
        ridx += 4
        self.IDX_PORTCOUNTER_TX_ICMP_REPLY = ridx
        ridx += 4
        self.IDX_PORTCOUNTER_TX_ICMP_REQUEST = ridx
        ridx += 4
        self.IDX_PORTCOUNTER_RX_ARP_REPLY = ridx
        ridx += 4
        self.IDX_PORTCOUNTER_RX_ARP_REQUEST = ridx
        ridx += 4
        self.IDX_PORTCOUNTER_RX_ICMP_REPLY = ridx
        ridx += 4
        self.IDX_PORTCOUNTER_RX_ICMP_REQUEST = ridx
        ridx += 4
        # other counter index is no used
        
        # media setting index
        self.MEDIA_DUPLEX_FULL = 1
        self.MEDIA_DUPLEX_HALF = 0
        self.MEDIA_NEGO_AUTO = 1
        self.MEDIA_NEGO_FORCE = 0
        self.MEDIA_SPEED_5G = 5
        self.MEDIA_SPEED_2P5G = 4
        self.MEDIA_SPEED_10G = 3
        self.MEDIA_SPEED_1G = 2
        self.MEDIA_SPEED_100M = 1
        self.MEDIA_SPEED_10M = 0
        self.MEDIA_SPEED_LINKDOWN = 0xff
        self.MEDIA_SIGNAL_COPPER = 0
        self.MEDIA_SIGNAL_FIBER = 1
        self.MEDIA_MASTERMODE_AUTO = 0
        self.MEDIA_MASTERMODE_MASTER = 1
        self.MEDIA_MASTERMODE_SLAVE = 2

        # learning mode
        self.LEARNING_NEVER = 0
        self.LEARNING_ONCE = 1
        self.LEARNING_EVERYTRAIL = 2

        # test mode
        self.RFCTEST_ERRORFILTERING = 0
        self.RFCTEST_FORWARDING = 1
        self.RFCTEST_BROADCASTFWD = 2
        self.RFCTEST_BROADCASTLATENCY = 3
        self.RFCTEST_FORWARDPRESSURE = 4
        self.RFCTEST_ADDRLEARNING = 5
        self.RFCTEST_ADDRCACHING = 6
        self.RFCTEST_CONGESTIONCTRL = 7
        self.RFCTEST_THROUGHPUT = 8 # same as forwarding with search mode
        self.RFCTEST_LATENCY = 9 # same as broadcast latency, but unicast
        self.RFCTEST_FRAMELOSS = 10
        self.RFCTEST_BACKTOBACK = 11
        self.RFCTEST_LATENCYOVERTIME = 12
        self.RFCTEST_LATENCYSNAPSHOT = 13
        self.RFCTEST_JITTER = 14

        # port protocol
        self.PROTOCOL_MAC = 0
        self.PROTOCOL_IP4 = 1
        self.PROTOCOL_IP6 = 2
		
		# for capture, 128 bytes set to 0
        self.CAPTURE_ALL = 0x40000000
        self.CAPTURE_UNDERSIZE = 0x00001000
        self.CAPTURE_OVERSIZE = 0x00002000
        self.CAPTURE_JUMBO = 0x00000001

        # T41 config 
        self.T451_CFG_DUTTYPE_PSE = 0
        self.T451_CFG_DUTTYPE_MIDSPAN = 1
        self.T451_CFG_ALTER_1236 = 0
        self.T451_CFG_ALTER_4578 = 1
        self.T451_CFG_ALTER_ALL = 2
        self.T451_CFG_CABLE_CAT3 = 0
        self.T451_CFG_CABLE_CAT5 = 1
        self.T451_CFG_CABLE_CAT7 = 2
        self.T451_CFG_CABLE_CAT7A = 3
        self.T451_CFG_REPORT_NONE = 0
        self.T451_CFG_REPORT_SAMPLE = 1
        self.T451_CFG_REPORT_FINAL = 2
        self.T451_CFG_REPORT_BOTH = 3
        self.T451_CFG_LOADING_FIX = 0
        self.T451_CFG_LOADING_INC = 1
        self.T451_CFG_LOADING_DEC = 2
        self.T451_CFG_LOADING_RANDOM = 3
        self.T451_CFG_LOADING_STEP = 4
        
        