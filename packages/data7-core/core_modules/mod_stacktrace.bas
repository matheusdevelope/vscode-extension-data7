Imports Collections
Imports mod_tobject
Imports mod_tlist

    ' @data7:keep-name
    Namespace StackTrace

    ' Call stack manual, leve e sem alocar objeto no Push/Pop.
    '   StackTrace.Push("Foo", "mod_x.bas", 12)
    '   StackTrace.Pop()
    '   Throw StackTrace.Fail("falha")
    '   Throw StackTrace.Wrap(ex, "contexto")
    '   Catch ex: Print StackTrace.Report(ex) : StackTrace.Clear()

    Private Dim _buf As StringList
    Private Dim _wraps As StringList
    Private Dim _originMsg As String
    Private Dim _disabled As Boolean
    Private Dim _sep As String

    Class TStackFrame
        Inherits TTObject

        FunctionName As String
        FileName As String
        Line As Integer
        Column As Integer

        Sub New(pFunctionName As String, pFileName As String = "", pLine As Integer = 0, pColumn As Integer = 0)
            MyBase.New()
            me.FunctionName = pFunctionName
            me.FileName = pFileName
            me.Line = pLine
            me.Column = pColumn
        End Sub

        Sub New(pValue As TStackFrame)
            MyBase.New()
            me.Assign(pValue)
        End Sub

        Sub Assign(pValue As TStackFrame)
            If Assigned(pValue) Then
                me.FunctionName = pValue.FunctionName
                me.FileName = pValue.FileName
                me.Line = pValue.Line
                me.Column = pValue.Column
            End If
        End Sub

        Overrides Function Clone() As TStackFrame
            Clone = New TStackFrame(me)
        End Function

        Function DisplayName() As String
            If me.FunctionName <> "" Then
                DisplayName = me.FunctionName
            Else
                DisplayName = "<anonymous>"
            End If
        End Function

        Function FormatLocation() As String
            Dim loc As String = me.FileName
            If me.Line > 0 Then
                If loc <> "" Then
                    loc = loc & ":" & CStr(me.Line)
                Else
                    loc = CStr(me.Line)
                End If
                If me.Column > 0 Then
                    loc = loc & ":" & CStr(me.Column)
                End If
            End If
            FormatLocation = loc
        End Function

        Overrides Function ToString() As String
            Dim loc As String = me.FormatLocation()
            If loc <> "" Then
                ToString = "at " & me.DisplayName() & " (" & loc & ")"
            Else
                ToString = "at " & me.DisplayName()
            End If
        End Function

        Overrides Sub Dispose()
        End Sub

        Sub Free()
            MyBase.Free()
        End Sub

    End Class

    Class TStackSnapshot
        Inherits TTObject

        Message As String
        Frames[] As TStackFrame

        Sub New(pMessage As String)
            MyBase.New()
            me.Message = pMessage
            me.Frames = []
        End Sub

        Function Count() As Integer
            If Assigned(me.Frames) Then
                Count = me.Frames.Length
            Else
                Count = 0
            End If
        End Function

        Function Origin() As TStackFrame
            If me.Count() > 0 Then
                Origin = me.Frames.First()
            Else
                Origin = NULL
            End If
        End Function

        Function Top() As TStackFrame
            If me.Count() > 0 Then
                Top = me.Frames.Last()
            Else
                Top = NULL
            End If
        End Function

        Function FrameAt(pIndex As Integer) As TStackFrame
            FrameAt = me.Frames.Take(pIndex)
        End Function

        Overrides Function Clone() As TStackSnapshot
            Dim copy As New TStackSnapshot(me.Message)
            Dim i As Integer
            Dim n As Integer = me.Count()
            For i = 0 To n - 1
                copy.Frames.Push(me.Frames.Take(i).Clone())
            Next
            Clone = copy
        End Function

        Function FormatFrames(pNewestFirst As Boolean = True) As String
            Dim nl As String = Char(13) & Char(10)
            Dim result As String = ""
            Dim n As Integer = me.Count()
            Dim i As Integer
            Dim idx As Integer
            Dim frame As TStackFrame
            If n = 0 Then
                FormatFrames = "    at <no frames>"
                Exit Function
            End If
            For i = 0 To n - 1
                If pNewestFirst Then
                    idx = n - 1 - i
                Else
                    idx = i
                End If
                frame = me.Frames.Take(idx)
                If i > 0 Then
                    result = result & nl
                End If
                result = result & "    " & frame.ToString()
            Next
            FormatFrames = result
        End Function

        Overrides Function ToString() As String
            Dim nl As String = Char(13) & Char(10)
            Dim result As String = "Error: " & me.Message
            result = result & nl & nl
            result = result & me.FormatFrames(True)
            ToString = result
        End Function

        Overrides Sub Dispose()
            If Assigned(me.Frames) Then
                me.Frames.Free()
                me.Frames = NULL
            End If
        End Sub

        Sub Free()
            MyBase.Free()
        End Sub

    End Class

    Class TException
        Inherits Exception

        Sub New(pMessage As String)
            ' data7:disable-next-line unknown-member
            MyBase.New(pMessage)
        End Sub

        Function ToString() As String
            ToString = FormatReport(me)
        End Function

        Sub Free()
            MyBase.Free()
        End Sub

    End Class

    Class TStackScope
        Inherits TTObject

        Private _open As Boolean

        ' Free() dá Pop. No caminho de erro, não chame Free — o frame
        ' precisa permanecer na stack viva até o Catch da raiz.
        Sub New(pFunctionName As String, pFileName As String = "", pLine As Integer = 0, pColumn As Integer = 0)
            MyBase.New()
            Push(pFunctionName, pFileName, pLine, pColumn)
            me._open = True
        End Sub

        Overrides Sub Dispose()
            If me._open Then
                Pop()
                me._open = False
            End If
        End Sub

        Sub Free()
            MyBase.Free()
        End Sub

    End Class

    Private Sub EnsureBuffer()
        If _sep = "" Then
            _sep = "|"
        End If
        If Not Assigned(_buf) Then
            _buf = New StringList()
            _buf.Capacity = 64
        End If
        If Not Assigned(_wraps) Then
            _wraps = New StringList()
        End If
    End Sub

    Private Function PackFrame(pFunctionName As String, pFileName As String, pLine As Integer, pColumn As Integer) As String
        PackFrame = pFunctionName & _sep & pFileName & _sep & CStr(pLine) & _sep & CStr(pColumn)
    End Function

    Private Function ToIntOrZero(pValue As String) As Integer
        If pValue = "" Then
            ToIntOrZero = 0
        Else
            ToIntOrZero = CInt(pValue)
        End If
    End Function

    Private Function FindSep(pText As String) As Integer
        Dim i As Integer
        Dim n As Integer
        Dim sepLen As Integer
        n = pText.Length
        sepLen = _sep.Length
        If sepLen <= 0 Then
            FindSep = 0
            Exit Function
        End If
        For i = 1 To (n - sepLen + 1)
            If pText.Copy(i, sepLen) = _sep Then
                FindSep = i
                Exit Function
            End If
        Next
        FindSep = 0
    End Function

    Private Function PackedField(pPacked As String, pField As Integer) As String
        Dim rest As String
        Dim found As Integer
        Dim i As Integer
        rest = pPacked
        For i = 0 To pField
            If rest = "" Then
                PackedField = ""
                Exit Function
            End If
            found = FindSep(rest)
            If i = pField Then
                If found <= 0 Then
                    PackedField = rest
                ElseIf found = 1 Then
                    PackedField = ""
                Else
                    PackedField = rest.Left(found - 1)
                End If
                Exit Function
            End If
            If found <= 0 Then
                PackedField = ""
                Exit Function
            End If
            If found >= rest.Length Then
                rest = ""
            Else
                rest = rest.Right(rest.Length - found)
            End If
        Next
        PackedField = ""
    End Function

    Private Function UnpackFrame(pPacked As String) As TStackFrame
        Dim fn As String
        Dim file As String
        Dim line As Integer
        Dim col As Integer
        fn = PackedField(pPacked, 0)
        file = PackedField(pPacked, 1)
        line = ToIntOrZero(PackedField(pPacked, 2))
        col = ToIntOrZero(PackedField(pPacked, 3))
        UnpackFrame = New TStackFrame(fn, file, line, col)
    End Function

    Private Function CopyLiveFrames(pMessage As String) As TStackSnapshot
        Dim snap As New TStackSnapshot(pMessage)
        EnsureBuffer()
        Dim i As Integer
        Dim n As Integer = _buf.Count
        For i = 0 To n - 1
            snap.Frames.Push(UnpackFrame(_buf.Strings(i)))
        Next
        CopyLiveFrames = snap
    End Function

    Function ExceptionMessage(pEx As Exception) As String
        If pEx = NULL Then
            ExceptionMessage = ""
        Else
            ExceptionMessage = pEx._GetMessage()
        End If
    End Function

    Function IsTraced(pEx As Exception) As Boolean
        Dim n As String
        IsTraced = False
        If pEx = NULL Then
            Exit Function
        End If
        Try
            n = TypeName(pEx)
            If n = "" Then
                n = pEx.ClassName()
            End If
            If n = "TException" Then
                IsTraced = True
            End If
        Catch ignored As Exception
        End Try
    End Function

    Private Function FormatReport(pEx As Exception) As String
        Dim nl As String = Char(13) & Char(10)
        Dim origin As String
        Dim snap As TStackSnapshot
        Dim result As String
        Dim i As Integer
        Dim wrapMsg As String

        origin = _originMsg
        If origin = "" Then
            origin = ExceptionMessage(pEx)
        End If
        If origin = "" Then
            origin = "(sem mensagem)"
        End If

        snap = CopyLiveFrames(origin)
        result = "Error: " & origin
        result = result & nl & nl
        result = result & snap.FormatFrames(True)

        If Assigned(_wraps) Then
            i = 0
            While i < _wraps.Count
                wrapMsg = _wraps.Strings(i)
                If wrapMsg <> "" And wrapMsg <> origin Then
                    result = result & nl & "Wrapped by: " & wrapMsg
                End If
                i = i + 1
            End While
        End If

        snap.Free()
        FormatReport = result
    End Function

    Function IsEnabled() As Boolean
        IsEnabled = Not _disabled
    End Function

    Sub Enable()
        _disabled = False
    End Sub

    Sub Disable()
        _disabled = True
    End Sub

    Function Depth() As Integer
        If Not Assigned(_buf) Then
            Depth = 0
        Else
            Depth = _buf.Count
        End If
    End Function

    Function Peek() As String
        If Depth() <= 0 Then
            Peek = ""
            Exit Function
        End If
        Dim packed As String = _buf.Strings(_buf.Count - 1)
        Peek = PackedField(packed, 0)
    End Function

    ' @data7:keep-name
    Sub Push(pFunctionName As String, pFileName As String = "", pLine As Integer = 0, pColumn As Integer = 0)
        If _disabled Then
            Exit Sub
        End If
        EnsureBuffer()
        _buf.Add(PackFrame(pFunctionName, pFileName, pLine, pColumn))
    End Sub

    ' @data7:keep-name
    Sub Pop()
        If _disabled Then
            Exit Sub
        End If
        If Not Assigned(_buf) Then
            Exit Sub
        End If
        If _buf.Count > 0 Then
            _buf.Delete(_buf.Count - 1)
        End If
    End Sub

    Sub Clear()
        If Assigned(_buf) Then
            _buf.Clear()
        End If
        If Assigned(_wraps) Then
            _wraps.Clear()
        End If
        _originMsg = ""
    End Sub

    ' @data7:keep-name
    Sub Clean()
        Clear()
    End Sub

    Function Enter(pFunctionName As String, pFileName As String = "", pLine As Integer = 0, pColumn As Integer = 0) As TStackScope
        Enter = New TStackScope(pFunctionName, pFileName, pLine, pColumn)
    End Function

    Function Capture(pMessage As String) As TStackSnapshot
        Capture = CopyLiveFrames(pMessage)
    End Function

    Function Capture(pException As Exception) As TStackSnapshot
        Capture = CopyLiveFrames(ExceptionMessage(pException))
    End Function

    Function CaptureAndClear(pMessage As String) As TStackSnapshot
        Dim snap As TStackSnapshot = Capture(pMessage)
        Clear()
        CaptureAndClear = snap
    End Function

    Function CaptureAndClear(pException As Exception) As TStackSnapshot
        Dim snap As TStackSnapshot = CaptureAndClear(ExceptionMessage(pException))
        CaptureAndClear = snap
    End Function

    Function Fail(pMessage As String) As TException
        EnsureBuffer()
        If _originMsg = "" Then
            _originMsg = pMessage
        End If
        Fail = New TException(pMessage)
    End Function

    Function Wrap(pEx As Exception, pMessage As String = "") As TException
        Dim nativeMsg As String
        EnsureBuffer()
        nativeMsg = ExceptionMessage(pEx)
        If _originMsg = "" Then
            _originMsg = nativeMsg
        End If
        If pMessage = "" Then
            pMessage = nativeMsg
        End If
        If pMessage <> "" Then
            _wraps.Add(pMessage)
        End If
        Wrap = New TException(pMessage)
    End Function

    Function SnapshotOf(pEx As Exception) As TStackSnapshot
        SnapshotOf = CopyLiveFrames(ExceptionMessage(pEx))
    End Function

    ' @data7:keep-name
    Function Report(pEx As Exception) As String
        Report = FormatReport(pEx)
    End Function

End Namespace
