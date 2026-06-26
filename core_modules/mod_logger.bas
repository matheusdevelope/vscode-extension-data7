
Imports IO
Imports mod_tlist
Imports Collections
Imports mod_tobject

'@Module
Namespace mod_logger

   Delegate Sub LogTransportWriter(pInfo As LogInfo, pFormatted As String)

   Class LogLevel
      Inherits TTObject

      Shared Function ErrorValue() As Integer
         ErrorValue = 0
      End Function

      Shared Function WarnValue() As Integer
         WarnValue = 1
      End Function

      Shared Function InfoValue() As Integer
         InfoValue = 2
      End Function

      Shared Function HttpValue() As Integer
         HttpValue = 3
      End Function

      Shared Function VerboseValue() As Integer
         VerboseValue = 4
      End Function

      Shared Function DebugValue() As Integer
         DebugValue = 5
      End Function

      Shared Function SillyValue() As Integer
         SillyValue = 6
      End Function

      Shared Function AsString(pLevel As Integer) As String
         Select Case pLevel
            Case 0
               AsString = "ERROR"
            Case 1
               AsString = "WARN"
            Case 2
               AsString = "INFO"
            Case 3
               AsString = "HTTP"
            Case 4
               AsString = "VERBOSE"
            Case 5
               AsString = "DEBUG"
            Case 6
               AsString = "SILLY"
            Case Else
               AsString = "LEVEL-" + pLevel.ToString()
         End Select
      End Function

      Shared Function FromString(pLevel As String) As Integer
         pLevel = pLevel.ToUpper().Trim()
         Select Case pLevel
            Case "ERROR"
               FromString = 0
            Case "ERRO"
               FromString = 0
            Case "WARN"
               FromString = 1
            Case "WARNING"
               FromString = 1
            Case "INFO"
               FromString = 2
            Case "HTTP"
               FromString = 3
            Case "VERBOSE"
               FromString = 4
            Case "DEBUG"
               FromString = 5
            Case "SILLY"
               FromString = 6
            Case Else
               FromString = 2
         End Select
      End Function

      Public Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Private Function LoggerLevelAsString(pLevel As Integer) As String
      Select Case pLevel
         Case 0
            LoggerLevelAsString = "ERROR"
         Case 1
            LoggerLevelAsString = "WARN"
         Case 2
            LoggerLevelAsString = "INFO"
         Case 3
            LoggerLevelAsString = "HTTP"
         Case 4
            LoggerLevelAsString = "VERBOSE"
         Case 5
            LoggerLevelAsString = "DEBUG"
         Case 6
            LoggerLevelAsString = "SILLY"
         Case Else
            LoggerLevelAsString = "LEVEL-" + pLevel.ToString()
      End Select
   End Function

   Private Function LoggerLevelFromString(pLevel As String) As Integer
      pLevel = pLevel.ToUpper().Trim()
      Select Case pLevel
         Case "ERROR"
            LoggerLevelFromString = 0
         Case "ERRO"
            LoggerLevelFromString = 0
         Case "WARN"
            LoggerLevelFromString = 1
         Case "WARNING"
            LoggerLevelFromString = 1
         Case "INFO"
            LoggerLevelFromString = 2
         Case "HTTP"
            LoggerLevelFromString = 3
         Case "VERBOSE"
            LoggerLevelFromString = 4
         Case "DEBUG"
            LoggerLevelFromString = 5
         Case "SILLY"
            LoggerLevelFromString = 6
         Case Else
            LoggerLevelFromString = 2
      End Select
   End Function

   Private Function DateTimeAsString(pValue As TDateTime) As String
      If pValue.IsDateTime Then
         DateTimeAsString = pValue.ToString("dd/mm/yyyy hh:nn:ss.zzz")
      ElseIf pValue.IsDate Then
         DateTimeAsString = pValue.ToString("dd/mm/yyyy")
      ElseIf pValue.IsTime Then
         DateTimeAsString = pValue.ToString("hh:nn:ss.zzz")
      Else
         DateTimeAsString = pValue.ToString("c")
      End If
   End Function

   Private Function ObjectAsString(pObject As TObject) As String
      If pObject = NULL Then
         ObjectAsString = ""
      ElseIf TypeOf(pObject) Is TTObject Then
         ObjectAsString = TTObject(pObject).ToString()
      Else
         ObjectAsString = pObject.ToString()
      End If
   End Function

   Class LogInfo
      Inherits TTObject

      Level As Integer
      LevelName As String
      Message As String
      DetailsText As String
      Meta As String
      Label As String
      Timestamp As TDateTime
      DurationMs As Integer
      IsException As Boolean
      ExceptionMessage As String
      FormattedMessage As String

      Sub New()
         MyBase.New()
         me.Timestamp = DateTime()
         me.Level = 2
         me.LevelName = LoggerLevelAsString(me.Level)
      End Sub

      Sub New(pSeverity As Integer, pMessage As String, pExtra As String = "", pMeta As String = "", pLabel As String = "")
         MyBase.New()
         me.Timestamp = DateTime()
         me.Level = pSeverity
         me.LevelName = LoggerLevelAsString(pSeverity)
         me.Message = pMessage
         me.DetailsText = pExtra
         me.Meta = pMeta
         me.Label = pLabel
      End Sub

      Sub New(pValue As LogInfo)
         MyBase.New()
         me.Assign(pValue)
      End Sub

      Sub Assign(pValue As LogInfo)
         If Assigned(pValue) Then
            me.Level = pValue.Level
            me.LevelName = pValue.LevelName
            me.Message = pValue.Message
            me.DetailsText = pValue.DetailsText
            me.Meta = pValue.Meta
            me.Label = pValue.Label
            me.Timestamp = pValue.Timestamp
            me.DurationMs = pValue.DurationMs
            me.IsException = pValue.IsException
            me.ExceptionMessage = pValue.ExceptionMessage
            me.FormattedMessage = pValue.FormattedMessage
         End If
      End Sub

      Overrides Function Clone() As LogInfo
         Clone = New LogInfo(me)
      End Function

      Function ToJson() As String
         Dim _json As New TJSONObject()
         _json.PutString("level", me.LevelName)
         _json.PutString("message", me.Message)
         _json.PutString("timestamp", me.Timestamp.ToString("yyyy-mm-dd hh:nn:ss.zzz"))
         If me.Label <> "" Then
            _json.PutString("label", me.Label)
         End If
         If me.DetailsText <> "" Then
            _json.PutString("extra", me.DetailsText)
         End If
         If me.Meta <> "" Then
            _json.PutString("meta", me.Meta)
         End If
         If me.DurationMs > 0 Then
            _json.PutInteger("durationMs", me.DurationMs)
         End If
         If me.IsException Then
            _json.PutString("exception", me.ExceptionMessage)
         End If
         ToJson = _json.ToString()
         _json.Free()
      End Function

      Overrides Function ToString() As String
         With me.BuildLogger(me.ClassName)
            .Prop("Level", me.LevelName)
            .Prop("Message", me.Message)
            .Prop("Label", me.Label)
            .Prop("Timestamp", me.Timestamp)
            ToString = .Text()
            .Free()
         End With
      End Function

      Overrides Sub Dispose()
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class LogFormat
      Inherits TTObject

      IncludeTimestamp As Boolean = True
      IncludeLevel As Boolean = True
      IncludeLabel As Boolean = True
      IncludeMeta As Boolean = True
      IncludeExtra As Boolean = True
      Json As Boolean = False
      TimestampFormat As String = "yyyy-mm-dd hh:nn:ss.zzz"

      Sub New()
         MyBase.New()
      End Sub

      Sub New(pValue As LogFormat)
         MyBase.New()
         me.Assign(pValue)
      End Sub

      Sub Assign(pValue As LogFormat)
         If Assigned(pValue) Then
            me.IncludeTimestamp = pValue.IncludeTimestamp
            me.IncludeLevel = pValue.IncludeLevel
            me.IncludeLabel = pValue.IncludeLabel
            me.IncludeMeta = pValue.IncludeMeta
            me.IncludeExtra = pValue.IncludeExtra
            me.Json = pValue.Json
            me.TimestampFormat = pValue.TimestampFormat
         End If
      End Sub

      Overrides Function Clone() As LogFormat
         Clone = New LogFormat(me)
      End Function

      Function Transform(pInfo As LogInfo) As String
         If pInfo = NULL Then
            Transform = ""
            Exit Function
         End If

         If me.Json Then
            Transform = pInfo.ToJson()
            Exit Function
         End If

         Dim _message As String = ""
         If me.IncludeTimestamp Then
            _message = _message + "[" + pInfo.Timestamp.ToString(me.TimestampFormat) + "] "
         End If
         If me.IncludeLevel Then
            _message = _message + "[" + pInfo.LevelName + "] "
         End If
         If me.IncludeLabel And pInfo.Label <> "" Then
            _message = _message + "[" + pInfo.Label + "] "
         End If
         _message = _message + pInfo.Message
         If me.IncludeExtra And pInfo.DetailsText <> "" Then
            _message = _message + Char(13) + pInfo.DetailsText
         End If
         If pInfo.IsException And pInfo.ExceptionMessage <> "" Then
            _message = _message + Char(13) + pInfo.ExceptionMessage
         End If
         If me.IncludeMeta And pInfo.Meta <> "" Then
            _message = _message + Char(13) + pInfo.Meta
         End If
         If pInfo.DurationMs > 0 Then
            _message = _message + " +" + pInfo.DurationMs.ToString() + "ms"
         End If
         Transform = _message
      End Function

      Overrides Function ToString() As String
         With me.BuildLogger(me.ClassName)
            .Prop("IncludeTimestamp", me.IncludeTimestamp)
            .Prop("IncludeLevel", me.IncludeLevel)
            .Prop("IncludeLabel", me.IncludeLabel)
            .Prop("IncludeMeta", me.IncludeMeta)
            .Prop("IncludeExtra", me.IncludeExtra)
            .Prop("Json", me.Json)
            .Prop("TimestampFormat", me.TimestampFormat)
            ToString = .Text()
            .Free()
         End With
      End Function

      Overrides Sub Dispose()
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class LogTransportOptions
      Inherits TTObject

      Level As Integer = 2
      StrictLevel As Boolean = False
      Silent As Boolean = False
      HandleExceptions As Boolean = True
      Format As LogFormat

      Sub New()
         MyBase.New()
         me.Format = New LogFormat()
      End Sub

      Sub New(pValue As LogTransportOptions)
         MyBase.New()
         me.Format = New LogFormat()
         me.Assign(pValue)
      End Sub

      Sub Assign(pValue As LogTransportOptions)
         If Assigned(pValue) Then
            me.Level = pValue.Level
            me.StrictLevel = pValue.StrictLevel
            me.Silent = pValue.Silent
            me.HandleExceptions = pValue.HandleExceptions
            If Assigned(me.Format) Then
               me.Format.Free()
            End If
            If Assigned(pValue.Format) Then
               me.Format = pValue.Format.Clone()
            Else
               me.Format = NULL
            End If
         End If
      End Sub

      Overrides Function Clone() As LogTransportOptions
         Clone = New LogTransportOptions(me)
      End Function

      Overrides Function GetID() As String
         GetID = CStr(me.GetHashCode())
      End Function

      Overrides Function ToString() As String
         With me.BuildLogger(me.ClassName)
            .Prop("Level", me.Level)
            .Prop("StrictLevel", me.StrictLevel)
            .Prop("Silent", me.Silent)
            .Prop("HandleExceptions", me.HandleExceptions)
            .Prop("Format", me.Format)
            ToString = .Text()
            .Free()
         End With
      End Function

      Overrides Sub Dispose()
         If Assigned(me.Format) Then
            me.Format.Free()
            me.Format = NULL
         End If
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class LogTransport
      Inherits TTObject

      Name As String = "transport"
      Options As LogTransportOptions

      Sub New()
         MyBase.New()
         me.Options = New LogTransportOptions()
      End Sub

      Sub New(pValue As LogTransport)
         MyBase.New()
         me.Options = New LogTransportOptions()
         me.Assign(pValue)
      End Sub

      Sub Assign(pValue As LogTransport)
         If Assigned(pValue) Then
            me.Name = pValue.Name
            If Assigned(me.Options) Then
               me.Options.Free()
            End If
            me.Options = NULL
            If Assigned(pValue.Options) Then
               me.Options = pValue.Options.Clone()
            End If
         End If
      End Sub

      Overrides Function Clone() As LogTransport
         Clone = New LogTransport(me)
      End Function

      Overrides Function GetID() As String
         If me.Name <> "" Then
            GetID = me.Name
         Else
            GetID = CStr(me.GetHashCode())
         End If
      End Function

      Overrides Function ToString() As String
         With me.BuildLogger(me.ClassName)
            .Prop("Name", me.Name)
            .Prop("Options", me.Options)
            ToString = .Text()
            .Free()
         End With
      End Function

      Overrides Sub Dispose()
         If Assigned(me.Options) Then
            me.Options.Free()
            me.Options = NULL
         End If
      End Sub

      Function ShouldLog(pInfo As LogInfo) As Boolean
         If pInfo = NULL Then
            ShouldLog = False
            Exit Function
         End If
         If me.Options.Silent Then
            ShouldLog = False
            Exit Function
         End If
         If pInfo.IsException And Not me.Options.HandleExceptions Then
            ShouldLog = False
            Exit Function
         End If
         If me.Options.StrictLevel Then
            ShouldLog = me.Options.Level = pInfo.Level
         Else
            ShouldLog = pInfo.Level <= me.Options.Level
         End If
      End Function

      Sub Write(pInfo As LogInfo)
         If Not me.ShouldLog(pInfo) Then
            Exit Sub
         End If
         Dim _formatted As String = me.Options.Format.Transform(pInfo)
         pInfo.FormattedMessage = _formatted
         me.Log(pInfo, _formatted)
      End Sub

      Overridable Sub Log(pInfo As LogInfo, pFormatted As String)
         Throw New Exception("LogTransport.Log must be implemented.")
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class TransportConsole
      Inherits LogTransport

      ProcessMessages As Boolean = False

      Sub New()
         MyBase.New()
         me.Name = "console"
      End Sub

      Sub New(pValue As TransportConsole)
         MyBase.New()
         me.Assign(pValue)
      End Sub

      Sub Assign(pValue As TransportConsole)
         If Assigned(pValue) Then
            MyBase.Assign(pValue)
            me.ProcessMessages = pValue.ProcessMessages
         End If
      End Sub

      Overrides Function Clone() As TransportConsole
         Clone = New TransportConsole(me)
      End Function

      Overrides Function ToString() As String
         With me.BuildLogger(me.ClassName)
            .Prop("Name", me.Name)
            .Prop("ProcessMessages", me.ProcessMessages)
            ToString = .Text()
            .Free()
         End With
      End Function

      Overrides Sub Log(pInfo As LogInfo, pFormatted As String)
         Print(pFormatted)
         If me.ProcessMessages Then
            Forms.ProcessMessages()
         End If
      End Sub

      Overrides Sub Dispose()
         MyBase.Dispose()
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class TransportFile
      Inherits LogTransport

      FileName As String

      Sub New(pFileName As String = "")
         MyBase.New()
         me.Name = "file"
         me.FileName = pFileName
      End Sub

      Sub New(pValue As TransportFile)
         MyBase.New()
         me.Assign(pValue)
      End Sub

      Sub Assign(pValue As TransportFile)
         If Assigned(pValue) Then
            MyBase.Assign(pValue)
            me.FileName = pValue.FileName
         End If
      End Sub

      Overrides Function Clone() As TransportFile
         Clone = New TransportFile(me)
      End Function

      Overrides Function ToString() As String
         With me.BuildLogger(me.ClassName)
            .Prop("Name", me.Name)
            .Prop("FileName", me.FileName)
            ToString = .Text()
            .Free()
         End With
      End Function

      Overrides Sub Log(pInfo As LogInfo, pFormatted As String)
         If me.FileName = "" Then
            Exit Sub
         End If
         Dim _lines As New StringList()
         If File.Exists(me.FileName) Then
            _lines.LoadFromFile(me.FileName)
         End If
         _lines.Add(pFormatted)
         _lines.SaveToFile(me.FileName)
         _lines.Free()
      End Sub

      Overrides Sub Dispose()
         MyBase.Dispose()
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class TransportVSCode
      Inherits TransportFile

      Sub New(pFileName As String = "")
         MyBase.New(pFileName)
         me.Name = "vscode"
      End Sub

      Sub New(pValue As TransportVSCode)
         MyBase.New()
         me.Assign(pValue)
      End Sub

      Sub Assign(pValue As TransportVSCode)
         If Assigned(pValue) Then
            MyBase.Assign(pValue)
         End If
      End Sub

      Overrides Function Clone() As TransportVSCode
         Clone = New TransportVSCode(me)
      End Function

      Overrides Function ToString() As String
         With me.BuildLogger(me.ClassName)
            .Prop("Name", me.Name)
            .Prop("FileName", me.FileName)
            ToString = .Text()
            .Free()
         End With
      End Function

      Overrides Sub Dispose()
         MyBase.Dispose()
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class TransportCallback
      Inherits LogTransport

      Writer As LogTransportWriter

      Sub New(pName As String, pWriter As LogTransportWriter)
         MyBase.New()
         me.Name = pName
         me.Writer = pWriter
      End Sub

      Sub New(pValue As TransportCallback)
         MyBase.New()
         me.Assign(pValue)
      End Sub

      Sub Assign(pValue As TransportCallback)
         If Assigned(pValue) Then
            MyBase.Assign(pValue)
            me.Writer = pValue.Writer
         End If
      End Sub

      Overrides Function Clone() As TransportCallback
         Clone = New TransportCallback(me)
      End Function

      Overrides Function ToString() As String
         With me.BuildLogger(me.ClassName)
            .Prop("Name", me.Name)
            .PropStr("Writer", "callback")
            ToString = .Text()
            .Free()
         End With
      End Function

      Overrides Sub Log(pInfo As LogInfo, pFormatted As String)
         If me.Writer <> NULL Then
            me.Writer(pInfo, pFormatted)
         End If
      End Sub

      Overrides Sub Dispose()
         me.Writer = NULL
         MyBase.Dispose()
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class LogTransportList
      Inherits TTObject

      Private _list As TTList<LogTransport>

      Sub New()
         MyBase.New()
         me._list = New TTList<LogTransport>()
         me._list.OwnsObjects = True
      End Sub

      Sub New(pValue As LogTransportList)
         MyBase.New()
         me._list = New TTList<LogTransport>()
         me._list.OwnsObjects = True
         me.Assign(pValue)
      End Sub

      Sub Assign(pValue As LogTransportList)
         If Assigned(pValue) Then
            me.Clear()
            Dim i As Integer, _count As Integer = pValue.Count()
            For i = 0 To _count - 1
               me.Add(pValue.Take(i).Clone())
            Next
         End If
      End Sub

      Overrides Function Clone() As LogTransportList
         Clone = New LogTransportList(me)
      End Function

      Overrides Function ToString() As String
         ToString = me._list.ToString()
      End Function

      Sub Add(pTransport As LogTransport)
         If pTransport = NULL Then
            Exit Sub
         End If
         me._list.Push(pTransport.GetID().ToUpper(), pTransport)
      End Sub

      Function Take(pIndex As Integer) As LogTransport
         Take = me._list.Take(pIndex)
      End Function

      Function Take(pID As String) As LogTransport
         Take = me._list.Take(pID.ToUpper())
      End Function

      Function Count() As Integer
         Count = me._list.Length
      End Function

      Sub Clear()
         me._list.Clean(True)
      End Sub

      Overrides Sub Dispose()
         If Assigned(me._list) Then
            me._list.Free()
            me._list = NULL
         End If
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class LoggerOptions
      Inherits TTObject

      Level As Integer = 2
      StrictLevel As Boolean = False
      Silent As Boolean = False
      ExitOnError As Boolean = False
      DefaultMeta As String
      Label As String
      Format As LogFormat
      Transports As LogTransportList

      Sub New()
         MyBase.New()
         me.Format = New LogFormat()
         me.Transports = New LogTransportList()
      End Sub

      Sub New(pValue As LoggerOptions)
         MyBase.New()
         me.Format = New LogFormat()
         me.Transports = New LogTransportList()
         me.Assign(pValue)
      End Sub

      Sub Assign(pValue As LoggerOptions)
         If Assigned(pValue) Then
            me.Level = pValue.Level
            me.StrictLevel = pValue.StrictLevel
            me.Silent = pValue.Silent
            me.ExitOnError = pValue.ExitOnError
            me.DefaultMeta = pValue.DefaultMeta
            me.Label = pValue.Label
            If Assigned(me.Format) Then
               me.Format.Free()
            End If
            If Assigned(me.Transports) Then
               me.Transports.Free()
            End If
            me.Format = NULL
            me.Transports = NULL
            If Assigned(pValue.Format) Then
               me.Format = pValue.Format.Clone()
            End If
            If Assigned(pValue.Transports) Then
               me.Transports = pValue.Transports.Clone()
            End If
         End If
      End Sub

      Overrides Function Clone() As LoggerOptions
         Clone = New LoggerOptions(me)
      End Function

      Overrides Function ToString() As String
         With me.BuildLogger(me.ClassName)
            .Prop("Level", me.Level)
            .Prop("StrictLevel", me.StrictLevel)
            .Prop("Silent", me.Silent)
            .Prop("ExitOnError", me.ExitOnError)
            .Prop("DefaultMeta", me.DefaultMeta)
            .Prop("Label", me.Label)
            .Prop("Format", me.Format)
            .Prop("Transports", me.Transports)
            ToString = .Text()
            .Free()
         End With
      End Function

      Overrides Sub Dispose()
         If Assigned(me.Transports) Then
            me.Transports.Free()
            me.Transports = NULL
         End If
         If Assigned(me.Format) Then
            me.Format.Free()
            me.Format = NULL
         End If
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Class Logger
      Inherits TTObject

      Options As LoggerOptions
      Private _sharedOptions As Boolean

      Sub New()
         MyBase.New()
         me.Options = New LoggerOptions()
      End Sub

      Sub New(pValue As Logger)
         MyBase.New()
         me.Options = New LoggerOptions()
         me.Assign(pValue)
      End Sub

      Sub Assign(pValue As Logger)
         If Assigned(pValue) Then
            If Assigned(me.Options) Then
               me.Options.Free()
            End If
            me.Options = NULL
            If Assigned(pValue.Options) Then
               me.Options = pValue.Options.Clone()
            End If
            me._sharedOptions = False
         End If
      End Sub

      Overrides Function Clone() As Logger
         Clone = New Logger(me)
      End Function

      Overrides Function ToString() As String
         With me.BuildLogger(me.ClassName)
            .Prop("Options", me.Options)
            .Prop("SharedOptions", me._sharedOptions)
            ToString = .Text()
            .Free()
         End With
      End Function

      Function Child(pDefaultMeta As String, pLabel As String = "") As Logger
         Dim _child As New Logger()
         _child.Options.Level = me.Options.Level
         _child.Options.StrictLevel = me.Options.StrictLevel
         _child.Options.Silent = me.Options.Silent
         _child.Options.ExitOnError = me.Options.ExitOnError
         If Assigned(_child.Options.Format) Then
            _child.Options.Format.Free()
         End If
         If Assigned(_child.Options.Transports) Then
            _child.Options.Transports.Free()
         End If
         _child.Options.Format = me.Options.Format
         _child.Options.Transports = me.Options.Transports
         _child.Options.DefaultMeta = me.MergeText(me.Options.DefaultMeta, pDefaultMeta)
         _child._sharedOptions = True
         If pLabel <> "" Then
            _child.Options.Label = pLabel
         Else
            _child.Options.Label = me.Options.Label
         End If
         Child = _child
      End Function

      Sub Add(pTransport As LogTransport)
         me.Options.Transports.Add(pTransport)
      End Sub

      Sub ClearTransports()
         me.Options.Transports.Clear()
      End Sub

      Sub Log(pLevel As Integer, pMessage As Variant, pExtra As String = "", pMeta As String = "")
         me.LogText(pLevel, CStr(pMessage), pExtra, pMeta)
      End Sub

      Sub Log(pLevel As Integer, pObject As TObject, pExtra As String = "", pMeta As String = "")
         me.LogText(pLevel, ObjectAsString(pObject), pExtra, pMeta)
      End Sub

      Private Sub LogText(pLevel As Integer, pMessage As String, pExtra As String = "", pMeta As String = "")
         If me.Options.Silent Then
            Exit Sub
         End If
         If me.Options.StrictLevel Then
            If me.Options.Level <> pLevel Then
               Exit Sub
            End If
         Else
            If pLevel > me.Options.Level Then
               Exit Sub
            End If
         End If

         Dim _info As New LogInfo(pLevel, pMessage, pExtra, me.MergeText(me.Options.DefaultMeta, pMeta), me.Options.Label)
         me.Dispatch(_info)
         _info.Free()
      End Sub

      Sub Log(pLevel As String, pMessage As Variant, pExtra As String = "", pMeta As String = "")
         me.Log(LoggerLevelFromString(pLevel), pMessage, pExtra, pMeta)
      End Sub

      Sub Exceptiom(pMessage As Variant, pEx As Exception, pMeta As String = "")
         Dim _info As New LogInfo(0, CStr(pMessage), "", me.MergeText(me.Options.DefaultMeta, pMeta), me.Options.Label)
         _info.IsException = True
         If pEx <> NULL Then
            _info.ExceptionMessage = pEx._GetMessage()
         End If
         me.Dispatch(_info)
         _info.Free()
      End Sub

      Sub Exceptiom(pObject As TObject, pEx As Exception, pMeta As String = "")
         Dim _info As New LogInfo(0, ObjectAsString(pObject), "", me.MergeText(me.Options.DefaultMeta, pMeta), me.Options.Label)
         _info.IsException = True
         If pEx <> NULL Then
            _info.ExceptionMessage = pEx._GetMessage()
         End If
         me.Dispatch(_info)
         _info.Free()
      End Sub

      Sub Erro(pMessage As Variant, pExtra As String = "", pMeta As String = "")
         me.Log(0, pMessage, pExtra, pMeta)
      End Sub

      Sub Erro(pObject As TObject, pExtra As String = "", pMeta As String = "")
         me.Log(0, pObject, pExtra, pMeta)
      End Sub

      Sub Warn(pMessage As Variant, pExtra As String = "", pMeta As String = "")
         me.Log(1, pMessage, pExtra, pMeta)
      End Sub

      Sub Warn(pObject As TObject, pExtra As String = "", pMeta As String = "")
         me.Log(1, pObject, pExtra, pMeta)
      End Sub

      Sub Info(pMessage As Variant, pExtra As String = "", pMeta As String = "")
         me.Log(2, pMessage, pExtra, pMeta)
      End Sub

      Sub Info(pObject As TObject, pExtra As String = "", pMeta As String = "")
         me.Log(2, pObject, pExtra, pMeta)
      End Sub

      Sub Http(pMessage As Variant, pExtra As String = "", pMeta As String = "")
         me.Log(3, pMessage, pExtra, pMeta)
      End Sub

      Sub Http(pObject As TObject, pExtra As String = "", pMeta As String = "")
         me.Log(3, pObject, pExtra, pMeta)
      End Sub

      Sub Verbose(pMessage As Variant, pExtra As String = "", pMeta As String = "")
         me.Log(4, pMessage, pExtra, pMeta)
      End Sub

      Sub Verbose(pObject As TObject, pExtra As String = "", pMeta As String = "")
         me.Log(4, pObject, pExtra, pMeta)
      End Sub

      Sub Debug(pMessage As Variant, pExtra As String = "", pMeta As String = "")
         me.Log(5, pMessage, pExtra, pMeta)
      End Sub

      Sub Debug(pObject As TObject, pExtra As String = "", pMeta As String = "")
         me.Log(5, pObject, pExtra, pMeta)
      End Sub

      Sub Silly(pMessage As Variant, pExtra As String = "", pMeta As String = "")
         me.Log(6, pMessage, pExtra, pMeta)
      End Sub

      Sub Silly(pObject As TObject, pExtra As String = "", pMeta As String = "")
         me.Log(6, pObject, pExtra, pMeta)
      End Sub

      Sub Printe(pMessage As Variant)
         me.Info(pMessage)
      End Sub

      Sub Printe(pObject As TObject)
         me.Info(pObject)
      End Sub

      Sub StartTimer(pLabel As String)
         StartTimer(pLabel)
      End Sub

      Sub Profile(pLabel As String, pMessage As String = "")
         Dim _duration As Integer = StopTimer(pLabel)
         Dim _info As New LogInfo(2, pMessage, "", me.Options.DefaultMeta, pLabel)
         _info.DurationMs = _duration
         me.Dispatch(_info)
         _info.Free()
      End Sub

      Private Sub Dispatch(pInfo As LogInfo)
         If me.Options.Transports.Count() = 0 Then
            If Not IsNativePrintEnabled() Then
               Exit Sub
            End If
            me.Options.Transports.Add(New TransportConsole())
         End If
         Dim i As Integer, _count As Integer = me.Options.Transports.Count()
         For i = 0 To _count - 1
            Dim _clone As LogInfo = pInfo.Clone()
            me.Options.Transports.Take(i).Write(_clone)
            _clone.Free()
         Next
      End Sub

      Private Function MergeText(pBase As String, pExtra As String) As String
         If pBase = "" Then
            MergeText = pExtra
         ElseIf pExtra = "" Then
            MergeText = pBase
         Else
            MergeText = pBase + Char(13) + pExtra
         End If
      End Function

      Overrides Sub Dispose()
         If me._sharedOptions And Assigned(me.Options) Then
            me.Options.Transports = NULL
            me.Options.Format = NULL
         End If
         If Assigned(me.Options) Then
            me.Options.Free()
            me.Options = NULL
         End If
         me._sharedOptions = False
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub

   End Class

   Private Dim _defaultLogger As Logger
   Private Dim _timers As StringList
   Private Dim _NativePrintEnabledInitialized As Boolean = False
   Private Dim _NativePrintEnabled As Boolean = True

   Function GetDefault() As Logger
      If _defaultLogger = NULL Then
         _defaultLogger = New Logger()
      End If
      GetDefault = _defaultLogger
   End Function

   Sub SetDefault(pLogger As Logger)
      _defaultLogger = pLogger
   End Sub

   Sub SetNativePrintEnabled(pEnabled As Boolean)
      _NativePrintEnabled = pEnabled
      _NativePrintEnabledInitialized = True
   End Sub

   Sub EnableNativePrint()
      SetNativePrintEnabled(True)
   End Sub

   Sub DisableNativePrint()
      SetNativePrintEnabled(False)
   End Sub

   Function IsNativePrintEnabled() As Boolean
      If Not _NativePrintEnabledInitialized Then
         _NativePrintEnabledInitialized = True
         Try
            Dim _exec As String = Data7.NomeArquivoExecutavel().ToUpper()
            If _exec.EndsWith("DATA7.EXE") Then
               _NativePrintEnabled = False
            Else
               _NativePrintEnabled = True
            End If
         Catch ex As Exception
            _NativePrintEnabled = True
         End Try
      End If
      IsNativePrintEnabled = _NativePrintEnabled
   End Function

   Sub ConfigureConsole()
      EnableNativePrint()
      Dim _logger As Logger = GetDefault()
      _logger.ClearTransports()
      _logger.Options.Silent = False
      _logger.Add(New TransportConsole())
   End Sub

   Sub ConfigureVSCode(pLogFile As String)
      DisableNativePrint()
      Dim _logger As Logger = GetDefault()
      _logger.ClearTransports()
      _logger.Options.Silent = False
      _logger.Options.Level = 6
      _logger.Options.DefaultMeta = "transport=vscode"
      _logger.Add(New TransportVSCode(pLogFile))
   End Sub

   Sub ConfigureERP()
      DisableNativePrint()
      Dim _logger As Logger = GetDefault()
      _logger.ClearTransports()
      _logger.Options.Silent = True
   End Sub

   Sub AddTransport(pTransport As LogTransport)
      GetDefault().Add(pTransport)
   End Sub

   Sub Log(pLevel As Integer, pMessage As String)
      GetDefault().Log(pLevel, pMessage)
   End Sub

   Sub Log(pLevel As Integer, pMessage As TDateTime)
      GetDefault().Log(pLevel, DateTimeAsString(pMessage))
   End Sub

   Sub Log(pLevel As Integer, pMessage As Variant)
      GetDefault().Log(pLevel, pMessage)
   End Sub

   Sub Log(pLevel As Integer, pObject As TObject)
      GetDefault().Log(pLevel, pObject)
   End Sub

   Sub Log(pLevel As String, pMessage As TDateTime)
      GetDefault().Log(pLevel, DateTimeAsString(pMessage))
   End Sub

   Sub Log(pLevel As String, pMessage As String)
      GetDefault().Log(pLevel, pMessage)
   End Sub

   Sub Log(pLevel As String, pMessage As Variant)
      GetDefault().Log(pLevel, pMessage)
   End Sub

   Sub Printe(pMessage As TDateTime)
      GetDefault().Printe(DateTimeAsString(pMessage))
   End Sub

   Sub Printe(pMessage As String)
      GetDefault().Printe(pMessage)
   End Sub

   Sub Printe(pMessage As Variant)
      GetDefault().Printe(pMessage)
   End Sub

   Sub Printe(pObject As TObject)
      GetDefault().Printe(pObject)
   End Sub

   Sub Erro(pMessage As TDateTime)
      GetDefault().Erro(DateTimeAsString(pMessage))
   End Sub

   Sub Erro(pMessage As String)
      GetDefault().Erro(pMessage)
   End Sub

   Sub Erro(pMessage As Variant)
      GetDefault().Erro(pMessage)
   End Sub

   Sub Erro(pObject As TObject)
      GetDefault().Erro(pObject)
   End Sub

   Sub Erro(pMessage As Variant, pEx As Exception)
      GetDefault().Exceptiom(pMessage, pEx)
   End Sub

   Sub Erro(pObject As TObject, pEx As Exception)
      GetDefault().Exceptiom(pObject, pEx)
   End Sub

   Sub Warn(pMessage As TDateTime)
      GetDefault().Warn(DateTimeAsString(pMessage))
   End Sub

   Sub Warn(pMessage As String)
      GetDefault().Warn(pMessage)
   End Sub

   Sub Warn(pMessage As Variant)
      GetDefault().Warn(pMessage)
   End Sub

   Sub Warn(pObject As TObject)
      GetDefault().Warn(pObject)
   End Sub

   Sub Info(pMessage As TDateTime)
      GetDefault().Info(DateTimeAsString(pMessage))
   End Sub

   Sub Info(pMessage As String)
      GetDefault().Info(pMessage)
   End Sub

   Sub Info(pMessage As Variant)
      GetDefault().Info(pMessage)
   End Sub

   Sub Info(pObject As TObject)
      GetDefault().Info(pObject)
   End Sub

   Sub Debug(pMessage As TDateTime)
      GetDefault().Debug(DateTimeAsString(pMessage))
   End Sub

   Sub Debug(pMessage As String)
      GetDefault().Debug(pMessage)
   End Sub

   Sub Debug(pMessage As Variant)
      GetDefault().Debug(pMessage)
   End Sub

   Sub Debug(pObject As TObject)
      GetDefault().Debug(pObject)
   End Sub

   Sub StartTimer(pLabel As String)
      If _timers = NULL Then
         _timers = New StringList()
         _timers.NameValueSeparator = ";"
      End If
      If _timers.IndexOfName(pLabel) >= 0 Then
         _timers.Delete(_timers.IndexOfName(pLabel))
      End If
      _timers.Add(pLabel + _timers.NameValueSeparator + DateTime().ToString("hh:nn:ss.zzz"))
   End Sub

   Function StopTimer(pLabel As String) As Integer
      StopTimer = 0
      If _timers = NULL Then
         Exit Function
      End If
      If _timers.IndexOfName(pLabel) < 0 Then
         Exit Function
      End If

      Dim _time As String = _timers.Values(pLabel)
      Dim _hours As Integer = CInt(_time.Split(":")[0])
      Dim _mins As Integer = CInt(_time.Split(":")[1])
      Dim _secs As Integer = CInt(_time.Split(":")[2].Split(".")[0])
      Dim _millis As Integer = CInt(_time.Split(".")[1])
      Dim _diff As TDateTime = DateTime() - DateTime().EncodeTime(_hours, _mins, _secs, _millis)
      Dim _diffText As String = _diff.ToString("hh:nn:ss.zzz")
      StopTimer = (CInt(_diffText.Split(":")[0]) * 3600000) + (CInt(_diffText.Split(":")[1]) * 60000) + (CInt(_diffText.Split(":")[2].Split(".")[0]) * 1000) + CInt(_diffText.Split(".")[1])
      _timers.Delete(_timers.IndexOfName(pLabel))
   End Function

End Namespace
