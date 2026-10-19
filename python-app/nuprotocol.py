import struct

# Hardware address format
ARP_HRD_PSEUDO	= 0x0000		# pseudo harward
ARP_HRD_ETH	= 0x0001		# ethernet hardware
ARP_HRD_IEEE802	= 0x0006		# IEEE 802 hardware
# Protocol address format
ARP_PRO_IP	= 0x0800		# IP protocol
# ARP operation
ARP_OP_REQUEST		= 1		# request to resolve ha given pa
ARP_OP_REPLY		= 2		# response giving hardware address
ARP_OP_REVREQUEST	= 3		# request to resolve pa given ha
ARP_OP_REVREPLY		= 4		# response giving protocol address

class ARP:
    def __init__(self):
        self.type_ether = 0x0806
        self.type_hw = ARP_HRD_ETH
        self.type_proto = ARP_PRO_IP
        self.size_hw = 0x6
        self.size_proto = 0x4
        self.opcode = 1
        # MAC=xx:xx:xx:xx:xx:xx
        self.smac = [0]*6
        # IP=xxx.xxx.xxx.xxx
        self.sip = [0]*4
        self.dmac = [0]*6
        self.dip = [0]*4
    def set_hwtype(self, val):
        if val == ARP_HRD_PSEUDO or val == ARP_HRD_ETH or val == ARP_HRD_IEEE802:
            self.type_hw = val
        else:
            self.type_hw = ARP_HRD_ETH
    def set_opcode(self, val):
        if val > ARP_OP_REVREPLY or val < ARP_OP_REQUEST:
            self.opcode = ARP_OP_REQUEST
        else:
            self.opcode = val
    def set_smac(self, val):
        self.smac = [int(x,16) for x in val.split(':')]
    def set_dmac(self, val):
        self.dmac = [int(x,16) for x in val.split(':')]
    def set_sip(self, val):
        self.sip = [int(x) for x in val.split('.')]
    def set_dip(self, val):
        self.dip = [int(x) for x in val.split('.')]

    def get_payload(self):
        return struct.pack("!3H2BH6B4B6B4B", self.type_ether, self.type_hw, self.type_proto, self.size_hw, self.size_proto, self.opcode, 
                           self.smac[0], self.smac[1], self.smac[2], self.smac[3], self.smac[4], self.smac[5], 
                           self.sip[0], self.sip[1], self.sip[2], self.sip[3], 
                           self.dmac[0], self.dmac[1], self.dmac[2], self.dmac[3], self.dmac[4], self.dmac[5], 
                           self.dip[0], self.dip[1], self.dip[2], self.dip[3])



#TRILL multi-destination
TRILL_NEXT_NONE       = 0
TRILL_NEXT_ETH       = 1
TRILL_NEXT_SNAP       = 2 #LLC
TRILL_NEXT_8022       = 3

class TRILL:
    def __init__(self):
        self.type_ether = 0x22f3
        self.version = 0
        self.reserved = 0
        self.hopcnt = 0
        self.egress = 0
        self.ingress = 0
        self.next_ethertype = TRILL_NEXT_NONE
        self.next_etherii = ETHERNET
        self.next_ethersnap = ETHERNET
        self.next_ether8022 = ETHERNET
        
    def set_version(self, val):
        if val > 3:
            self.version = 3
        elif val < 0:
            self.version = 0
        else:
            self.version = val
    def set_reserved(self, val):
        if val > 3:
            self.reserved = 3
        elif val < 0:
            self.reserved = 0
        else:
            self.reserved = val
    def set_hopcnt(self, val):
        if val > 63:
            self.hopcnt = 63
        elif val < 0:
            self.hopcnt = 0
        else:
            self.hopcnt = val
    def set_egress(self, val):
        if val > 65535:
            self.egress = 65535
        elif val < 0:
            self.egress = 0
        else:
            self.egress = val;
    def set_ingress(self, val):
        if val > 65535:
            self.ingress = 65535
        elif val < 0:
            self.ingress = 0
        else:
            self.ingress = val

    def set_nextethertype(self, val):
        if val > TRILL_NEXT_8022 or val < TRILL_NEXT_NONE:
            self.next_ethertype = TRILL_NEXT_NONE
        else:
            self.next_ethertype = val
    
    def get_payload(self):
        tmp_payload = self.hopcnt + self.reserved*4096 + self.version*16384
        stream = struct.pack("!4H", self.type_ether, tmp_payload, self.egress, self.ingress)
        if next_ethertype == TRILL_NEXT_ETH:
            stream += self.next_etherii.get_payload()
        elif next_ethertype == TRILL_NEXT_SNAP:
            stream += self.next_ethersnap.get_payload()
        elif next_ethertype == TRILL_NEXT_8022:
            stream += self.next_ether8022.get_payload()

        return stream

class ISIS:
    def __init__(self):
        self.type_ether = 0x22f4

# VLAN type
VLAN_NONE       = 0
VLAN_ONE        = 1
VLAN_QINQ       = 2
# Ethernet Type
ETHERTYPE_IPv4            = 0
ETHERTYPE_ARP             = 1
ETHERTYPE_TRILL           = 2
ETHERTYPE_ISIS            = 3
ETHERTYPE_RARP            = 4
ETHERTYPE_IPX             = 5
ETHERTYPE_BPDU            = 6
ETHERTYPE_IPv6            = 7
ETHERTYPE_MACCTRL         = 8
ETHERTYPE_SLOW            = 9
ETHERTYPE_MPLS_UNI        = 10
ETHERTYPE_MPLS_MUL        = 11
ETHERTYPE_PPPoE_DISCOVER  = 12
ETHERTYPE_PPPoE_SESSION   = 13
ETHERTYPE_LLDP            = 14
ETHERTYPE_PTP_V2          = 15
ETHERTYPE_CFM             = 16
ETHERTYPE_FCOE            = 17
ETHERTYPE_FIP             = 18
ETHERTYPE_ECP             = 19
ETHERTYPE_LOOP            = 20
ETHERTYPE_RESERVED        = 21

class ETHERNET:
    arp = ARP()
    isis = ISIS()
    def __init__(self):
        self.dmac = [0]*6
        self.smac = [0]*6
        self.vlantype = VLAN_NONE
        self.ethertype = ETHERTYPE_RESERVED
        self.vlan_tag1 = 0x8100
        self.vlan_tag2 = 0x88A8 #if QinQ
        self.vlan_priority1 = 0
        self.vlan_cfi1 = 0
        self.vlan_vid1 = 0
        self.vlan_priority2 = 0
        self.vlan_cfi2 = 0
        self.vlan_vid2 = 0
        

    def set_smac(self, val):
        self.smac = [int(x,16) for x in val.split(':')]
    def set_dmac(self, val):
        self.dmac = [int(x,16) for x in val.split(':')]
    def set_vlantype(self, val):
        if val == VLAN_NONE or val == VLAN_ONE or val == VLAN_QINQ:
            self.vlantype = val
        else:
            self.vlantype = VLAN_NONE
    def set_ethertype(self, val):
        if val > ETHERTYPE_RESERVED or val < ETHERTYPE_IPv4:
            self.ethertype = ETHERTYPE_RESERVED
        else:
            self.ethertype = val
    def set_vlan_tag1(self, val):
        if val > 0xFFFF:
            self.vlan_tag1 = 0x8100
        else:
            self.vlan_tag1 = val
    def set_vlan_tag2(self, val):
        if val > 0xFFFF:
            self.vlan_tag2 = 0x88A8
        else:
            self.vlan_tag2 = val
    def set_vlan_prior1(self, val):
        if val > 7 or val < 0:
            self.vlan_priority1 = 0
        else:
            self.vlan_priority1 = val
    def set_vlan_prior2(self, val):
        if val > 7 or val < 0:
            self.vlan_priority2 = 0
        else:
            self.vlan_priority2 = val
    def set_vlan_cfi1(self, val):
        if val > 1 or val < 0:
            self.vlan_cfi1 = 0
        else:
            self.vlan_cfi1 = val
    def set_vlan_cfi2(self, val):
        if val > 1 or val < 0:
            self.vlan_cfi2 = 0
        else:
            self.vlan_cfi2 = val
    def set_vlan_id1(self, val):
        if val > 4095 or val < 0:
            self.vlan_vid1 = 0
        else:
            self.vlan_vid1 = val
    def set_vlan_id2(self, val):
        if val > 4095 or val < 0:
            self.vlan_vid2 = 0
        else:
            self.vlan_vid2 = val
    def get_payload(self):
        stream = struct.pack("!12B", self.dmac[0], self.dmac[1], self.dmac[2], self.dmac[3], self.dmac[4], self.dmac[5], 
                             self.smac[0], self.smac[1], self.smac[2], self.smac[3], self.smac[4], self.smac[5])
        #VLAN
        if self.vlantype == VLAN_QINQ:
            vlan_tmp = self.vlan_priority2*8192+self.vlan_cfi2*4096+self.vlan_vid2
            stream += struct.pack("!2H", self.vlan_tag2, vlan_tmp)
            vlan_tmp = self.vlan_priority1*8192+self.vlan_cfi1*4096+self.vlan_vid1
            stream += struct.pack("!2H", self.vlan_tag1, vlan_tmp)
        elif self.vlantype == VLAN_ONE:
            vlan_tmp = self.vlan_priority1*8192+self.vlan_cfi1*4096+self.vlan_vid1
            stream += struct.pack("!2H", self.vlan_tag1, vlan_tmp)

        if self.ethertype == ETHERTYPE_ARP:
            stream += self.arp.get_payload()
        elif self.ethertype == ETHERTYPE_TRILL:
            stream += self.trill.get_payload()
        elif self.ethertype == ETHERTYPE_ISIS:
            stream += self.trill.get_payload()
        return stream


# TRILL.__init__ references the ETHERNET class by name, so trill can only be
# instantiated as a class attribute after ETHERNET finishes defining (moving
# `trill = TRILL()` into the class body raises NameError: ETHERNET isn't
# bound yet while its own body is still executing).
ETHERNET.trill = TRILL()

