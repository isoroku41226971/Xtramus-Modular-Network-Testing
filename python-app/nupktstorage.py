#!/usr/bin/python
# -*- encoding: utf-8 -*-
import struct
import os
import xml.sax

class PcapPktHeader:
    def __init__(self, time_sec, time_microsec, len):
        self.second = time_sec
        self.microsecond = time_microsec
        self.caplen = len
        self.len = len
        
    def get_payload(self):
        return struct.pack("<4I", self.second, self.microsecond, self.caplen, self.len) 

class PcapCommandHeader:
    def __init__(self):
        self.magic = 0xa1b2c3d4
        self.ver_major = 0x2
        self.ver_minor = 0x4
        self.thiszone = 0
        self.sigfigs = 0
        self.snaplen = 0xffff
        self.linktype = 0x1
    # change to little endian
    def get_payload(self):
        return struct.pack("<I2H4I", self.magic, self.ver_major, self.ver_minor, self.thiszone, self.sigfigs, self.snaplen, self.linktype) 

class ProtocolFromXML:
    def __init__(self):
        self.protoname = "tcp"
        self.showname = ""
        self.list_field = []

class PacketFromXML:
    def __init__(self):
        self.proto = "TCP"
        self.length = 54
        self.list_protocol = []

class SinglePacketInfo:
    def __init__(self):
        self.timestamp = []
        self.length = []
        self.frames = []
        self.frames_info = []
        
class NuStreamsPacketStorage(xml.sax.handler.ContentHandler):
    def __init__(self):
        #self.list_pktinfo = [None]*64
        self.list_timestamp =[[] for i in range(64)]
        self.list_length = [[] for i in range(64)]
        self.list_frames = [[] for i in range(64)]
        self.list_frames_info = [[] for i in range(64)]

        self.header_pcap = PcapCommandHeader()
        self.header_pkt = PcapPktHeader(0,0,64)
        
        # record XML report
        self.nowPidx = 0
        self.isField = False
        self.isRecordProto = False
        self.currentData = ""
        self.field = ""
        self.xmlcount = 0
        self.xmlpktcnt = 0
        self.oneProtocol = ProtocolFromXML()
        self.onePacket = PacketFromXML()
        

    def clear_packet(self, pidx):
        del self.list_timestamp[pidx][:]
        del self.list_length[pidx][:]
        del self.list_frames[pidx][:]

    def append_packet(self, pidx, length, timestamp, contents):
        self.list_timestamp[pidx].append(timestamp)
        self.list_length[pidx].append(length)
        # contents is a packet list
        self.list_frames[pidx].append(contents)
    
    # print int list to hex list
    def show_packet_content(self, pidx, fidx):
        if pidx < 0:
            pidx = 0
        elif pidx >= 64:
            pidx = 63
        # 20170602, TK, added. is there packet or not
        if len(self.list_frames[pidx]) > 0:
            if fidx < 1:
                fidx = 0
            elif fidx >= len(self.list_frames[pidx]):
                fidx = len(self.list_frames[pidx])-1
            #print('[{}]'.format(', '.join(hex(x) for x in self.list_frames[pidx][fidx])))
            try:
                print('[{}]'.format(', '.join('{:02x}'.format(x) for x in self.list_frames[pidx][fidx])))
            except:
                print("(Exception) packet index error")    
        else:
            print("(Exception) there is no packet to show.")
    
    
    def show_packet_info(self, pidx, fidx):
        if pidx < 0:
            pidx = 0
        elif pidx >= 64:
            pidx = 63
        # 20170602, TK, added. is there packet or not
        if len(self.list_frames_info[pidx]) > 0:
            if fidx < 1:
                fidx = 0
            elif fidx >= len(self.list_frames_info[pidx]):
                fidx = len(self.list_frames_info[pidx])-1
            # 20170602, TK, added. using packet index to decide
            try:
                protonum = len(self.list_frames_info[pidx][fidx].list_protocol)
                for x in range(protonum):
                    print(self.list_frames_info[pidx][fidx].list_protocol[x].showname)
                    fieldnum = len(self.list_frames_info[pidx][fidx].list_protocol[x].list_field)
                    for idx in range(fieldnum):
                        print(self.list_frames_info[pidx][fidx].list_protocol[x].list_field[idx])
            except:
                print("(Exception) packet index error")
        else:
            print("(Exception) there is no packet info. to show.")
    #####################<  For XML  >##########################
    def startElement(self, tag, attributes):  
        self.currentData = tag
        #print(attributes.getNames()) #show all attirbutes in a list

        if tag == "packet":
            self.xmlpktcnt += 1
        elif tag == "proto":
            self.isField = False
            if ("name" in attributes):
                if attributes["name"] == "geninfo" or attributes["name"] == "frame":
                    self.isRecordProto = False
                else:
                    self.isRecordProto = True
                if self.isRecordProto == True:
                    self.oneProtocol.protoname = attributes["name"]
                    if ("showname" in attributes):
                        self.oneProtocol.showname = attributes["showname"]
        elif  tag == "field": 
            self.isField = True
            if (self.isRecordProto == True) and ("showname" in attributes):
                self.oneProtocol.list_field.append("    "+attributes["showname"])
            
   
    # element end event process. process <tag /> xml
    def endElement(self, tag):
        # when proto finished, append to proto list. when packet finished, all append to packet list
        if tag == "packet":
            # clear protocol list
            tmpPacket = PacketFromXML()
            tmpPacket.proto = self.onePacket.proto
            tmpPacket.length = self.onePacket.length
            tmpPacket.list_protocol = self.onePacket.list_protocol[:]
            self.list_frames_info[self.nowPidx].append(tmpPacket)
            self.onePacket.list_protocol[:] = []
        if tag == "proto":
            if self.isRecordProto == True:
                # clear field list, protocl append to packet
                tmpProtocol = ProtocolFromXML()
                tmpProtocol.protoname = self.oneProtocol.protoname
                tmpProtocol.showname = self.oneProtocol.showname
                tmpProtocol.list_field = self.oneProtocol.list_field[:]
                self.onePacket.list_protocol.append(tmpProtocol)
                self.oneProtocol.list_field[:] = []
        self.currentData = ""
        
    # element content process
    def characters(self, content):  
        # there are no contents in this xml tag
        # mark. here will print twice
        #if self.currentData == "packet":
        #    print("(characters)Process pkts - %d" %(Handler.xmlpktcnt))
        if self.currentData == "field":
            self.field = content 

    #####################<  For XML  />##########################
    def generate_pcap(self, pidx):
        pcap_name = "tmppcap.pcap"
        total_pkts = len(self.list_timestamp[pidx])
        if total_pkts > 0:
            binfile = open(pcap_name, 'wb')
            initial_time = self.list_timestamp[pidx][0]
            
            bytes = self.header_pcap.get_payload()
            try:
                for idx in range(total_pkts):
                    self.header_pkt.caplen = self.list_length[pidx][idx]
                    self.header_pkt.len = self.header_pkt.caplen
                    interval_time = (self.list_timestamp[pidx][idx]-initial_time)*0.04
                    # 20170703, TK, modified. force convert to int
                    self.header_pkt.second = int(interval_time/1000000)
                    self.header_pkt.microsecond = int(interval_time - self.header_pkt.second*1000000)
                    if self.header_pkt.microsecond < 0:
                        self.header_pkt.microsecond = 0
                    # using the length of frames, not depends on list_length
                    #packstring = "!" + str(self.list_length[pidx][idx]) + "B"
                    packstring = "!" + str(len(self.list_frames[pidx][idx])) + "B"
                    bytes += self.header_pkt.get_payload()+struct.pack(packstring, *self.list_frames[pidx][idx])
            except:
                print("(Exception) packet size error")
            else:
                binfile.write(bytes)
            finally:
                binfile.close()
            # sometimes the tshark would not be run success because the wireshark didnt in the PATH, setting the PATH in the batch file first.
            os.system("processpcap.bat")
            #command = 'tshark -r tmppcap.pcap -V -T pdml > ax.xml'
            #os.system(command)
        
        
    def analysis_packet(self, pidx):
        self.nowPidx = pidx
        self.generate_pcap(pidx)
        parser = xml.sax.make_parser()
        # turn off namepsaces
        parser.setFeature(xml.sax.handler.feature_namespaces, 0)
        # rewrite ContextHandler
        Handler = self
        parser.setContentHandler( Handler )
        try:
            parser.parse("ax.xml")
        except:
            print("(Exception) no such XML file")
        
#testpcap = NuStreamsPacketStorage()
#testpcap.append_packet(0,48,0,[0,0x22,0xa2,0,0,1,0,0x22,0xa2,0,0,2,0xff,0xff,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])
#testpcap.append_packet(0,48,3,[0,0x22,0xa2,0,0,1,0,0x22,0xa2,0,0,2,0xff,0xff,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])
#testpcap.append_packet(0,60,10,[0,0x22,0xa2,0,0,1,0,0x22,0xa2,0,0,2,0xff,0xff,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])
#testpcap.append_packet(0,72,50,[0,0x22,0xa2,0,0,1,0,0x22,0xa2,0,0,2,0xff,0xff,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])
#testpcap.analysis_packet(0)
#testpcap.show_packet_info(0,3)