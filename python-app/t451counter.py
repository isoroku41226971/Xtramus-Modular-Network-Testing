import struct

class T451InstantVal:
    def __init__(self):
        self.timestamp = 0
        self.val_volt = 0
        self.val_curr = 0

class T451Counter:
    def __init__(self):
        self.conn_power = 0
        self.conn_time_rise = 0 # unit in us.
        self.conn_time_inrush = 0 # unit in us.
        self.conn_time_detect_1 = 0 # unit in us
        self.conn_time_detect_2 = 0 # unit in us
        self.conn_time_poweron = 0 # unit in us.
        self.conn_volt_1 = 0 # unit in 0.01V.
        self.conn_volt_2 = 0 # unit in 0.01V.
        self.conn_volt_class = 0 # unit 0.01V.
        self.conn_volt_inrush_h = 0
        self.conn_volt_inrush_l = 0
        self.conn_type_pse = 0 #2:AT 1:AF  0: unknown
        self.conn_type_device = 0 # 0-PSE 1-Midspan
        self.conn_curr_detect = 0 # unit 0.0001A.
        self.conn_curr_inrush = 0 # 0.0001A.
        self.conn_polarity_detect = 0

        self.disconn_volt_h = 0 # unit in 10mV
        self.disconn_volt_l = 0 # unit in 10mV
        self.disconn_turnoff = 0 #unit in ms
        self.disconn_time_maintain = 0 # Unit ms
        self.disconn_result = 0 # 0: Fail.1 : Success.

        self.over_time = 0 # unit in ms
        self.over_curr = 0 # unit in 0.0001A
        self.over_result = 0 # 0: Fail.1 : Success.

        self.under_time = 0 # unit in ms
        self.under_curr = 0 # unit in 0.0001A
        self.under_result = 0 # 0: Fail.1 : Success.

        self.short_time = 0 # unit in ms
        self.short_curr_10us = 0 # unit in 0.0001A, range in 400~450ma
        self.short_curr_50ms = 0 # unit in 0.0001A
        self.short_result = 0 # 0: Fail.1 : Success.

        self.load_volt_peak = 0 # unit in 0.01V
        self.load_volt_min = 0 # unit in 0.01V
        self.load_curr_peak = 0 # unit in 0.0001A
        self.load_curr_min = 0 # unit in 0.0001A
        self.load_flag_voltunder = 0
        self.load_flag_voltover = 0
        self.load_result = 0 # 0: Fail.1 : Success.

        self.counter_volt_peak = 0
        self.counter_volt_min = 0
        self.counter_volt_now = 0
        self.counter_curr_peak = 0
        self.counter_curr_min = 0
        self.counter_curr_now = 0
        self.counter_flag_voltunder = 0
        self.counter_flag_voltover = 0
        self.counter_power = 0
        self.counter_temp1 = 0
        self.counter_temp2 = 0
        self.counter_stack = [0]*600
        self.counter_inst_timestamp = [0]*1500
        self.counter_inst_volt = [0]*1500
        self.counter_inst_curr = [0]*1500
        self.counter_idx = 0
        self.sample_idx = 0
        self.sample_totalnum = 0
        self.sample_timestamp = 0
        self.sample_valnum = 0
        self.sample_val = [0]*256

    def parser_sample(self, pktlist):
        print("(T451 Report) sample")
        idx = 0
        self.sample_idx = pktlist[idx]*256 + pktlist[idx+1]
        idx += 2
        self.sample_totalnum = pktlist[idx]*256 + pktlist[idx+1]
        idx += 2
        #struct.unpack('I', pktlist[idx:idx+4])[0]
        self.sample_timestamp = pktlist[idx]*256*256*256 + pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.sample_valnum = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        for vidx in range(256):
            ridx = vidx*4+idx
            self.sample_val[vidx] = pktlist[ridx]*256*256*256 + pktlist[ridx+1]*256*256 + pktlist[ridx+2]*256 + pktlist[ridx+3]

    def parser_counter(self, pktlist):
        #print("(T451 Report) counter")
        idx = 0
        self.counter_volt_peak = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.counter_curr_peak = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.counter_volt_min = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.counter_curr_min = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.counter_power = pktlist[idx+3]
        idx += 4
        self.counter_flag_voltunder = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.counter_flag_voltover = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.counter_temp1 = pktlist[idx+3]
        idx += 4
        self.counter_temp2 = pktlist[idx+3]
        idx += 4
        self.counter_volt_now = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.counter_curr_now = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        if self.counter_idx < 1500:
            for iidx in range(50):
                ridx = iidx*12+idx
                #cidx = self.counter_idx*50+iidx
                tmp_ts = pktlist[ridx+1]*256*256+pktlist[ridx+2]*256+pktlist[ridx+3]
                if tmp_ts > 0:
                    self.counter_inst_timestamp[self.counter_idx] = tmp_ts
                    self.counter_inst_volt[self.counter_idx] = pktlist[ridx+6]*256+pktlist[ridx+7]
                    self.counter_inst_curr[self.counter_idx] = pktlist[ridx+10]*256+pktlist[ridx+11]
                    self.counter_idx += 1
            

    def parser_connect(self, pktlist):
        print("(T451 Report) connect")
        idx = 0
        try:
            self.conn_power = pktlist[idx+3]
            idx += 4
            self.conn_time_rise = pktlist[idx]*256*256*256 + pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
            #self.conn_time_rise = struct.unpack('I', pktlist[idx:idx4])[0]
            idx += 4
            self.conn_time_inrush = pktlist[idx]*256*256*256 + pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
            idx += 4
            self.conn_curr_inrush = pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
            idx += 4
            self.conn_volt_1 = pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
            idx += 4
            self.conn_volt_2 = pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
            idx += 4
            self.conn_time_detect_1 = pktlist[idx]*256*256*256 + pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
            idx += 4
            self.conn_time_detect_2 = pktlist[idx]*256*256*256 + pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
            idx += 4
            self.conn_volt_class = pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
            idx += 4
            self.conn_curr_detect = pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
            idx += 4
            self.conn_type_pse = pktlist[idx+3]
            idx += 4
            self.conn_volt_inrush_h = pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
            idx += 4
            self.conn_volt_inrush_l = pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
            idx += 4
            self.conn_time_poweron = pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
            idx += 4
            self.conn_type_device = pktlist[idx+3]
            idx += 4
            self.conn_polarity_detect = pktlist[idx]*256*256*256 + pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
            
        except:
            strshow = "  (connect exception) idx = "
            strshow += str(idx)
            print(strshow)

    def parser_disconnect(self, pktlist):
        print("(T451 Report) disconnect")
        idx = 0
        self.disconn_turnoff = pktlist[idx]*256*256*256 + pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.disconn_time_maintain = pktlist[idx]*256*256*256 + pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.disconn_volt_h = pktlist[idx]*256*256*256 + pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.disconn_volt_l = pktlist[idx]*256*256*256 + pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.disconn_result = pktlist[idx+3]

    def parser_over(self, pktlist):
        print("(T451 Report) overload")
        idx = 0
        self.over_time = pktlist[idx]*256*256*256 + pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.over_curr = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.over_result = pktlist[idx+3]

    def parser_under(self, pktlist):
        print("(T451 Report) underload")
        idx = 0
        self.under_time = pktlist[idx]*256*256*256 + pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.under_curr = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.under_result = pktlist[idx+3]

    def parser_short(self, pktlist):
        print("(T451 Report) short circuit")
        idx = 0
        self.short_time = pktlist[idx]*256*256*256 + pktlist[idx+1]*256*256 + pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.short_curr_10us = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.short_curr_50ms = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.short_result = pktlist[idx+3]

    def parser_load(self, pktlist):
        print("(T451 Report) loading")
        idx = 0
        self.load_volt_peak = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.load_curr_peak = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.load_volt_min = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.load_curr_min = pktlist[idx+2]*256 + pktlist[idx+3]
        idx += 4
        self.load_flag_voltunder = pktlist[idx+3]
        idx += 4
        self.load_flag_voltover = pktlist[idx+3]


    def show_connect(self):
        print ("#####  Connect Test Report  #####")
        strshow = "  Power : "
        if self.conn_power == 1:
            strshow += "Power Good"
        else:
            strshow += "No Power"
        print(strshow)
        strshow = "  Rise time : "
        strshow += str(self.conn_time_rise)
        strshow += " us"
        print(strshow)
        strshow = "  Inrush time : "
        strshow += str(self.conn_time_inrush)
        strshow += " us"
        print(strshow)
        strshow = "  Inrush current : "
        strshow += str(self.conn_curr_inrush*0.1)
        strshow += " mA"
        print(strshow)
        strshow = "  Voltage 1 : "
        strshow += str(self.conn_volt_1*0.01)
        strshow += " V"
        print(strshow)
        strshow = "  Voltage 2 : "
        strshow += str(self.conn_volt_2*0.01)
        strshow += " V"
        print(strshow)
        strshow = "  Time 1 : "
        strshow += str(self.conn_time_detect_1)
        strshow += " us"
        print(strshow)
        strshow = "  Time 2 : "
        strshow += str(self.conn_time_detect_2)
        strshow += " us"
        print(strshow)
        strshow = "  Voltage class : "
        strshow += str(self.conn_volt_class*0.01)
        strshow += " V"
        print(strshow)
        strshow = "  Current : "
        strshow += str(self.conn_curr_detect*0.1)
        strshow += " mA"
        print(strshow)
        strshow = "  PSE type : "
        if self.conn_type_pse == 1:
            strshow += "AF"
        elif self.conn_type_pse == 2:
            strshow += "AT"
        else:
            strshow += "Unknown"
        print(strshow)
        strshow = "  Inrush voltage high : "
        strshow += str(self.conn_volt_inrush_h*10)
        strshow += " mV"
        print(strshow)
        strshow = "  Inrush voltage low : "
        strshow += str(self.conn_volt_inrush_l*10)
        strshow += " mV"
        print(strshow)
        strshow = "  Poweron time : "
        strshow += str(self.conn_time_poweron)
        strshow += " ms"
        print(strshow)
        strshow = "  Device type : "
        if self.conn_type_device == 0:
            strshow += "PSE"
        else:
            strshow += "Midspan"
        print(strshow)
        strshow = "  Polarity : "
        if self.conn_polarity_detect > 0x80000000:
            strshow += "Pair(12,36) - "
            num1236 = self.conn_polarity_detect & 0x0000000F
            if num1236 == 0:
                strshow += "No Power"
            elif num1236 == 1:
                strshow += "Inverse"
            elif num1236 == 2:
                strshow += "Normal"
            strshow += ", Pair(45,78) - "
            num4578 = self.conn_polarity_detect & 0x000000F0
            if num4578 == 0:
                strshow += "No Power"
            elif num4578 == 16:
                strshow += "Inverse"
            elif num4578 == 32:
                strshow += "Normal"
        else:
            strshow += "No Detect"
        print(strshow)

    def show_disconnect(self):
        print ("#####  Disconnect Test Report  #####")
        strshow = "  Turnoff time : "
        strshow += str(self.disconn_turnoff)
        strshow += " ms"
        print(strshow)
        strshow = "  Maintain time : "
        strshow += str(self.disconn_time_maintain)
        strshow += " ms"
        print(strshow)
        strshow = "  Voltage High : "
        strshow += str(self.disconn_volt_h*10)
        strshow += " mV"
        print(strshow)
        strshow = "  Voltage low : "
        strshow += str(self.disconn_volt_l*10)
        strshow += " mV"
        print(strshow)
        strshow = "  Result : "
        if self.disconn_result == 1:
            strshow += "Pass"
        else:
            strshow += "Fail"
        
        print(strshow)
    
    def show_overload(self):
        print ("#####  Overload Test Report  #####")
        strshow = "  Time : "
        strshow += str(self.over_time)
        strshow += " ms"
        print(strshow)
        strshow = "  Current : "
        strshow += str(self.over_curr*0.1)
        strshow += " mA"
        print(strshow)
        strshow = "  Result : "
        if self.over_result == 1:
            strshow += "Pass"
        else:
            strshow += "Fail"
        print(strshow)

    def show_underload(self):
        print ("#####  Underload Test Report  #####")
        strshow = "  Time : "
        strshow += str(self.under_time)
        strshow += " ms"
        print(strshow)
        strshow = "  Current : "
        strshow += str(self.under_curr*0.1)
        strshow += " mA"
        print(strshow)
        strshow = "  Result : "
        if self.under_result == 1:
            strshow += "Pass"
        else:
            strshow += "Fail"
        print(strshow)
    
    def show_shortcircuit(self):
        print ("#####  Short Circuit Test Report  #####")
        strshow = "  Time : "
        strshow += str(self.short_time)
        strshow += " ms"
        print(strshow)
        strshow = "  Current in 10us : "
        strshow += str(self.short_curr_10us*0.1)
        strshow += " mA"
        print(strshow)
        strshow = "  Current in 50ms : "
        strshow += str(self.short_curr_50ms*0.1)
        strshow += " mA"
        print(strshow)
        strshow = "  Result : "
        if self.short_result == 1:
            strshow += "Pass"
        else:
            strshow += "Fail"
        print(strshow)

    def show_loading(self):
        print ("#####  Loading Test Report  #####")
        strshow = "  Peak voltage : "
        strshow += str(self.load_volt_peak*0.01)
        strshow += " V"
        print(strshow)
        strshow = "  Min. voltage : "
        strshow += str(self.load_volt_min*0.01)
        strshow += " V"
        print(strshow)
        strshow = "  Peak current : "
        strshow += str(self.load_curr_peak*0.1)
        strshow += " mA"
        print(strshow)
        strshow = "  Min. current : "
        strshow += str(self.load_curr_min*0.1)
        strshow += " mA"
        print(strshow)
        strshow = "  Under voltage flag : "
        if self.load_flag_voltunder > 0 :
            strshow += "Too low"
        else:
            strshow += "N/A"
        print(strshow)
        strshow = "  Oer voltage flag : "
        if self.load_flag_voltover > 0 :
            strshow += "Too high"
        else:
            strshow += "N/A"
        print(strshow)
        strshow = "  Result : "
        if self.load_result == 1:
            strshow += "Pass"
        else:
            strshow += "Fail"
        print(strshow)
        
        
    