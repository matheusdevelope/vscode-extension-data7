Imports mod_tobject

'@Module
Namespace mod_tlist

   Delegate Function TFindDel<T>(pValue As T, i As Integer, extra As Variant) As Boolean
   Delegate Function TMapDel<T>(pValue As T, i As Integer, extra As Variant) As T
   Delegate Sub TForEachDel<T>(pValue As T, i As Integer, extra As Variant)

   <# If Not TypeSystem.InheritsFrom(T, "TTObject") Then #>
   Class TTItem<T>
      Inherits TTObject

      Private _id As String
      Value As T

      Property ID As String
         Get
            ID = me._id
         End Get
      End Property

      Sub New(pValue As T)
         MyBase.New()
         me._init("", pValue)
      End Sub

      Sub New(pID As String, pValue As T)
         MyBase.New()
         me._init(pID, pValue)
      End Sub

      Sub New(pValue As TTItem<T>)
         MyBase.New()
         me.Assign(pValue)
      End Sub

      Private Sub _init(pID As String, pValue As T)
         pID = pID.Trim()
         If pID <> "" Then
            me._id = pID
         Else
            me._id = CStr(me.GetHashCode)
         End If
         me.Value = pValue
      End Sub

      Sub Assign(pValue As TTItem<T>)
         If Assigned(pValue) Then
            me._id = pValue.ID
            me.Value = pValue.Value
         End If
      End Sub

      Overrides Function Clone() As TTItem<T>
         Clone = New TTItem<T>(me)
      End Function

      Overrides Function GetID() As String
         GetID = me._id
      End Function

      Overrides Function ToString() As String
         With me.BuildLogger(me.Classname)
            .Prop("ID", me._id)
            .Prop("Value", me.Value.ToString())
            .Prop("Type", TypeName(me.Value))
            ToString = .Text
         End With
      End Function

      Overrides Sub Dispose()
         me._id = Unassigned
         <# If TypeSystem.InheritsFrom(T, "TObject") Then #>
         If Assigned(me.Value) Then
            me.Value.Free()
            me.Value = NULL
         End If
         <# Else #>
         me.Value = Unassigned
         <# End If #>
      End Sub

      Public Sub Free()
         MyBase.Free()
      End Sub

   End Class
   <# End If #>

   Class TTList<T>
      Inherits TTComposerList

      Sub New()
         MyBase.New(me.Classname(), True)
      End Sub

      Private Function Wrap(pID As String, pValue As T) As TTObject
         <# If TypeSystem.InheritsFrom(T, "TTObject") Then #>
         Wrap = pValue
         <# Else #>
         Wrap = New TTItem<T>(pID, pValue)
         <# End If #>
      End Function

      Private Function Unwrap(pObj As TTObject) As T
         <# If TypeSystem.InheritsFrom(T, "TTObject") Then #>
         Unwrap = T(pObj)
         <# Else #>
         Unwrap = TTItem<T>(pObj).Value
         <# End If #>
      End Function

      Function GetItem(pIndex As Integer) As T
         GetItem = me.Take(pIndex)
      End Function

      Sub SetItem(pIndex As Integer, pValue As T)
         me._base.Item(pIndex) = me.Wrap("", pValue)
      End Sub

      Sub Push(pID As String, pValue As T)
         me._base.Push(pID, me.Wrap(pID, pValue))
      End Sub

      Sub Push(pValue As T)
         me.Push("", pValue)
      End Sub

      Sub Push(pValue As TTList<T>)
         me._base.Push(pValue)
      End Sub

      Sub Unshift(pIndex As Integer, pID As String, pValue As T)
         me._base.Unshift(pIndex, pID, me.Wrap(pID, pValue))
      End Sub

      Sub Unshift(pIndex As Integer, pValue As T)
         me.Unshift(pIndex, "", pValue)
      End Sub

      Overrides Function Take(pIndex As Integer) As T
         Take = me.Unwrap(me._base.Take(pIndex))
      End Function

      Function Take(pID As String) As T
         Take = me.Unwrap(me._base.TakeFromId(pID))
      End Function

      Function First() As T
         First = me.Unwrap(me._base.First())
      End Function

      Function Last() As T
         Last = me.Unwrap(me._base.Last())
      End Function

      Function Pop() As T
         Dim _extracted As TTObject = me._base.Pop()
         Pop = me.Unwrap(_extracted)
         <# If Not TypeSystem.InheritsFrom(T, "TTObject") Then #>
         If Assigned(_extracted) Then
            <# If TypeSystem.InheritsFrom(T, "TObject") Then #>
            TTItem<T>(_extracted).Value = NULL
            <# End If #>
            _extracted.Free()
         End If
         <# End If #>
      End Function

      Function Shift() As T
         Dim _extracted As TTObject = me._base.Shift()
         Shift = me.Unwrap(_extracted)
         <# If Not TypeSystem.InheritsFrom(T, "TTObject") Then #>
         If Assigned(_extracted) Then
            <# If TypeSystem.InheritsFrom(T, "TObject") Then #>
            TTItem<T>(_extracted).Value = NULL
            <# End If #>
            _extracted.Free()
         End If
         <# End If #>
      End Function

      Sub Unshift(pValue As T)
         me.Unshift(0, pValue)
      End Sub

      Function Includes(pValue As T) As Boolean
         Dim i As Integer, _len As Integer = me.Length
         For i = 0 To _len - 1
            Dim _current As T = me.Take(i)
            Dim _equal As Boolean = me.GetIsEqual(_current, pValue)
            If _equal Then
               Includes = True
               Exit Function
            End If
         Next
         Includes = False
      End Function

      Function GetIsEqual(pValue1 As T, pValue2 As T) As Boolean
         <# If TypeSystem.InheritsFrom(T, "TTObject") Then #>
         If Assigned(pValue1) And Assigned(pValue2) Then
            GetIsEqual = (pValue1 = pValue2)
         Else
            GetIsEqual = False
         End If
         <# Else #>
         GetIsEqual = (pValue1 = pValue2)
         <# End If #>
      End Function

      Function Join(pSeparator As String) As String
         Dim _str As String = ""
         Dim i As Integer, _len As Integer = me.Length
         For i = 0 To _len - 1
            If i > 0 Then _str = _str & pSeparator
            Dim _val As T = me.Take(i)
            _str = _str & me.GetToString(_val)
         Next
         Join = _str
      End Function

      Function GetToString(pValue As T) As String
         <# If TypeSystem.InheritsFrom(T, "TTObject") Then #>
         If Assigned(pValue) Then
            GetToString = pValue.ToString()
         Else
            GetToString = ""
         End If
         <# Else #>
         GetToString = CStr(pValue)
         <# End If #>
      End Function

      Function Slice(pStart As Integer, pEnd As Integer) As TTList<T>
         Dim _new As New TTList<T>(me.Name)
         _new._base = me._base.Slice(pStart, pEnd)
         Slice = _new
      End Function

      Function Splice(pStart As Integer, pQty As Integer) As TTList<T>
         Dim _new As New TTList<T>(me.Name)
         _new._base = me._base.Splice(pStart, pQty)
         Splice = _new
      End Function

      Function Clone() As TTList<T>
         Dim _new As New TTList<T>(me.Name)
         _new._base = me._base.Clone()
         Clone = _new
      End Function

      Function First(pLimit As Integer) As TTList<T>
         Dim _new As New TTList<T>(me.Name)
         _new._base = me._base.Range(pLimit, False)
         First = _new
      End Function

      Function Last(pLimit As Integer) As TTList<T>
         Dim _new As New TTList<T>(me.Name)
         _new._base = me._base.Range(pLimit, True)
         Last = _new
      End Function

      Function IndexOf(pHandler As TFindDel<T>) As Integer
         IndexOf = me.IndexOf(pHandler, "")
      End Function

      Function IndexOf(pHandler As TFindDel<T>, extra As Variant) As Integer
         Dim value As Integer = -1
         Dim i As Integer, _length As Integer = me.Length
         For i = 0 To _length - 1
            If pHandler(me.Take(i), i, extra) Then
               value = i
               Exit For
            End If
         Next
         IndexOf = value
      End Function

      Function Find(pHandler As TFindDel<T>) As T
         Find = me.Find(pHandler, "")
      End Function

      Function Find(pHandler As TFindDel<T>, extra As Variant) As T
         Dim i As Integer, _length As Integer = me.Length
         For i = 0 To _length - 1
            Dim _value As T = me.Take(i)
            If pHandler(_value, i, extra) Then
               Find = _value
               Exit Function
            End If
         Next
      End Function

      Function Filter(pHandler As TFindDel<T>) As TTList<T>
         Filter = me.Filter(pHandler, "")
      End Function

      Function Filter(pHandler As TFindDel<T>, extra As Variant) As TTList<T>
         Dim _new As New TTList<T>()
         Dim i As Integer, _length As Integer = me.Length
         For i = 0 To _length - 1
            Dim _value As T = me.Take(i)
            If pHandler(_value, i, extra) Then
               Dim _id As String = me._base.Take(i).GetID()
               _new.Push(_id, _value)
            End If
         Next
         Filter = _new
      End Function

      Sub ForEach(pHandler As TForEachDel<T>)
         me.ForEach(pHandler, "")
      End Sub

      Sub ForEach(pHandler As TForEachDel<T>, extra As Variant)
         Dim i As Integer, _length As Integer = me.Length
         For i = 0 To _length - 1
            pHandler(me.Take(i), i, extra)
         Next
      End Sub

      Function Map(pHandler As TMapDel<T>) As TTList<T>
         Map = me.Map(pHandler, "")
      End Function

      Function Map(pHandler As TMapDel<T>, extra As Variant) As TTList<T>
         Dim _new As New TTList<T>()
         Dim i As Integer, _length As Integer = me.Length
         For i = 0 To _length - 1
            Dim _value As T = me.Take(i)
            Dim _id As String = me._base.Take(i).GetID()
            _new.Push(_id, pHandler(_value, i, extra))
         Next
         Map = _new
      End Function

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

End Namespace
