Imports Collections

'@Module
Namespace console

   Private Dim _ProcessMessages As Boolean
   Private Dim _ProcessMessagesSetted As Boolean
   Private Dim _timers As StringList

   Dim AlwaysPrint As Boolean = False

   Dim BlockPrint As Boolean = False

   Sub log(pMessage As Variant)
      console.Printe("[LOG] " & CStr(pMessage))
   End Sub

   Sub log(pMessage1 As Variant, pMessage2 As Variant)
      console.Printe("[LOG] " & CStr(pMessage1) & Char(13) & CStr(pMessage2))
   End Sub

   Sub log(pMessage1 As Variant, pMessage2 As Variant, pMessage3 As Variant)
      console.Printe("[LOG] " & CStr(pMessage1) & Char(13) & CStr(pMessage2) & Char(13) & CStr(pMessage3))
   End Sub

   Sub log(pMessage1 As Variant, pMessage2 As Variant, pMessage3 As Variant, pMessage4 As Variant)
      console.Printe("[LOG] " & CStr(pMessage1) & Char(13) & CStr(pMessage2) & Char(13) & CStr(pMessage3) & Char(13) & CStr(pMessage4))
   End Sub

   Sub erro(pMessage As Variant, pEx As Exception)
      console.Printe("[ERRO] " & CStr(pMessage) & Char(13) & pEx._GetMessage())
   End Sub

   Sub time(pMessage As Variant)
      console.Printe("[" + DateTime().ToString("hh:nn:ss.zzz") + "] " & CStr(pMessage))
   End Sub

   Sub time(pTime As TDateTime, pMessage As Variant)
      If pTime.IsDateTime
         console.Printe("[" + pTime.ToString("dd/mm/yyyy hh:nn:ss.zzz") + "] " & Cstr(pMessage))
      End If
      If pTime.IsDate
         console.Printe("[" + pTime.ToString("dd/mm/yyyy") + "] " & pMessage)
      End If
      If pTime.IsTime
         console.Printe("[" + pTime.ToString("dd/mm/yyyy") + "] " & pMessage)
      End If
   End Sub

   Sub timeStart(pLabel As String, pMessage As String = "")
      console.addTime(pLabel)
      console.printTime("START", pLabel, pMessage)
   End Sub

   Sub timeLog(pLabel As String, pMessage As String = "")
      console.printTime("LOG", pLabel, pMessage)
   End Sub

   Sub timeEnd(pLabel As String, pMessage As String = "")
      console.printTime("END", pLabel, pMessage)
      console.removeTime(pLabel)
   End Sub

   Private Sub printTime(pStep As String, pLabel As String, pMessage As String = "")
      Dim idx As Integer = console.timeIndex(pLabel)
      If idx >= 0
         Dim time_str As String = console.timeDiff(pLabel).ToString("hh:nn:ss.zzz")
         IF time_str = "00:00:00.000"
            time_str = ""
         End If
         IF pMessage <> ""
            pMessage = CHAR(13) & pMessage
         End If
         console.Printe("[TIME " & pStep.ToUpper & "] " + pLabel + ": " & time_str & pMessage)
      Else
         console.Printe("[TIME " & pStep.ToUpper & "] " + pLabel + ": Timer Not Setup")
      End If
   End Sub

   Private Sub addTime(pLabel As String)
      console.removeTime(pLabel)
      _timers.Add(pLabel + _timers.NameValueSeparator + DateTime().ToString("hh:nn:ss.zzz"))
   End Sub

   Private Sub removeTime(pLabel As String)
      console.initTime()
      If console.timeIndex(pLabel) >= 0
         _timers.Delete(console.timeIndex(pLabel))
      End If
   End Sub

   Private Function timeIndex(pLabel As String) As Integer
      console.initTime()
      timeIndex = _timers.IndexOfName(pLabel)
   End Function

   Private Function timeDiff(pLabel As String) As TDateTime
      console.initTime()
      If console.timeIndex(pLabel) >= 0
         Dim time_str As String = _timers.Values(pLabel)
         Dim hours As Integer = CInt(time_str.Split(":")[0])
         Dim mins As Integer = CInt(time_str.Split(":")[1])
         Dim secs As Integer = CInt(time_str.Split(":")[2].Split(".")[0])
         Dim millisecs As Integer = CInt(time_str.Split(".")[1])
         timeDiff = DateTime() - DateTime().EncodeTime(hours, mins, secs, millisecs)
      End If
   End Function

   Private Sub initTime()
      IF _timers = NULL
         _timers = New StringList()
         _timers.NameValueSeparator = ";"
      End If
   End Sub

   Sub ProcessMessages(pEnabled As Boolean)
      _ProcessMessages = pEnabled
      _ProcessMessagesSetted = True
   End Sub

   Function GetProcessMessages As Boolean
      GetProcessMessages = _ProcessMessages
   End Function

   Private Sub Printe(pMessage As String)
      If Not BlockPrint
         print pMessage
         IF NOT _ProcessMessagesSetted
            console.ProcessMessages(True)
         End IF
         If _ProcessMessages
            Forms.ProcessMessages
         End If
      End If
   End Sub

End Namespace
