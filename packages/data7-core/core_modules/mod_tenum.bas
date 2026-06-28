Imports Collections
Imports mod_tobject
'@Module-Imported
Namespace mod_tenum
   Class TEnum
      Inherits TTObject

      Private Shared _enum_cache As StringList
      Private Shared _enum_cache_initialized As Boolean
      Protected _value As Integer
      Protected _description As String
      Private Sub New(pValue As Integer, pDescription As String)
         MyBase.New()
         me._value = pValue
         me._description = pDescription
      End Sub

      Private Sub New(pValue As TEnum)
         MyBase.New()
         me.Assign(pValue)
      End Sub

      Sub Assign(pValue As TEnum)
         If Assigned(pValue) Then
            me._value = pValue._value
            me._description = pValue._description
         End If
      End Sub

      Overrides Function Clone() As TEnum
         Clone = New TEnum(me)
      End Function
      Property AsInteger As Integer
         Get
            AsInteger = me._value
         End Get
      End Property
      Property AsString As String
         Get
            AsString = me._description
         End Get
      End Property
      Property AsOption As String
         Get
            AsOption = """" & me.AsString & "=" & CStr(me.AsInteger) & """"
         End Get
      End Property
      Function IsValue(pValue As TEnum) As Boolean
         IsValue = me.IsValue(pValue.AsInteger)
      End Function
      Function IsValue(pValue As Variant) As Boolean
         Select Case TypeName(pValue)
            Case "String"
               IsValue = UCase(pValue) = UCase(me.AsString)
            Case "Integer", "Long", "Byte"
               IsValue = pValue = me.AsInteger
            Case Else
               IsValue = False
         End Select
      End Function
      Protected Shared Function _GetKeyCache(pClassName As String, pEnumName As String) As String
         _GetKeyCache = UCase(pClassName) & "-" & UCase(pEnumName)
      End Function
      Protected Shared Function _IsCached(pClassName As String, pEnumName As String) As Boolean
         If Not _enum_cache_initialized Then Return False
         Dim _key As String = TEnum._GetKeyCache(pClassName, pEnumName)
         _IsCached = _enum_cache.IndexOf(_key) >= 0
      End Function
      Protected Shared Sub _AddCache(pClassName As String, pEnumName As String, pEnum As TEnum)
         If Not _enum_cache_initialized Then
            _enum_cache = New StringList()
            _enum_cache_initialized = True
         End If
         Dim _key As String = TEnum._GetKeyCache(pClassName, pEnumName)
         _enum_cache.AddObject(_key, pEnum)
      End Sub
      Protected Shared Sub _AddEnumItem(pClassName As String, pEnum As TEnum)
         If Not TEnum._IsCached(pClassName, pEnum.AsString) Then
            TEnum._AddCache(pClassName, pEnum.AsString, pEnum)
         End If
      End Sub
      Protected Shared Function _GetCache(pClassName As String, pEnumName As String) As TObject
         If Not _enum_cache_initialized Then Throw New Exception("Enum cache not initialized")
         Dim _key As String = TEnum._GetKeyCache(pClassName, pEnumName)
         Dim _idx As Integer = _enum_cache.IndexOf(_key)
         If _idx < 0 Then Throw New Exception("Enum '" & pEnumName & "' not found in '" & pClassName & "'")
         Return _enum_cache.Objects(_idx)
      End Function
      Protected Shared Function _GetCache(pClassName As String, pEnumId As Integer) As TObject
         If Not _enum_cache_initialized Then Throw New Exception("Enum cache not initialized")
         Dim i As Integer
         For i = 0 To _enum_cache.Count - 1
            Dim _enum As TEnum = TEnum(_enum_cache.Objects(i))
            Dim _string_key As String = _enum_cache.Strings(i)
            If _enum.AsInteger = pEnumId And _string_key.ToUpper.StartsWith(UCase(pClassName))
               _GetCache = _enum
               Exit Function
            End If
         Next
         Throw New Exception("Enum ID '" & pEnumId.ToString() & "' not found in " & pClassName)
      End Function
      Protected Shared Function _GetEnumOptions(pClassName As String) As String
         If Not _enum_cache_initialized Then Return ""
         Dim _result As String = ""
         Dim i As Integer
         For i = 0 To _enum_cache.Count - 1
            Dim _enum As TEnum = TEnum(_enum_cache.Objects(i))
            Dim _string_key As String = _enum_cache.Strings(i)
            If _string_key.ToUpper.StartsWith(UCase(pClassName) & "-") Then
               If _result <> "" Then _result = _result & ";"
               _result = _result & _enum.AsString & "=" & CStr(_enum.AsInteger)
            End If
         Next
         _GetEnumOptions = _result.Trim()
      End Function
      Overrides Function ToString() As String
         With me.BuildLogger(me.ClassName)
            .Prop("AsInteger", me.AsInteger)
            .Prop("AsString", me.AsString)
            .Prop("AsOption", me.AsOption)
            ToString = .Text()
            .Free()
         End With
      End Function

      Overrides Sub Dispose()
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub

   End Class
End Namespace
