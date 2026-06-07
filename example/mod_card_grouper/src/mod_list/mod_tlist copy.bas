Imports mod_tobject

'@Module
Namespace mod_tlistc

   'Dim _listStrings As TTList<Variant>
   'Dim _listIntegers As TTList<Integer>
   'Dim _listStrings As TTList<String>
   'Dim _listProdutos As TTListObj<Produto>

   Delegate Function TFindDel<T>(pValue As T, i As Integer, extra As Variant) As Boolean
   Delegate Function TMapDel<T>(pValue As T, i As Integer, extra As Variant) As T
   Delegate Sub TForEachDel<T>(pValue As T, i As Integer, extra As Variant)

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
.Prop("Value", me.Value)
.Prop("Type", TypeName(me.Value))
ToString = .Text
End With
End Function

Overrides Sub Dispose()
me._id = Unassigned
me.Value = Unassigned
End Sub

End Class

Class TTList<T>
   Inherits TTComposerList

   Sub New()
      MyBase.New(me.Classname(), True)
   End Sub

   Overridable Function GetWrapper(pIndex As Integer) As TTItem<T>
   GetWrapper = CType(me._base.Take(pIndex), TTItem<T>)
End Function

Function GetItem(pIndex As Integer) As T
   Dim _item As TTItem<T> = me.GetWrapper(pIndex)
   If Assigned(_item) Then GetItem = _item.Value Else GetItem = Unassigned
End Function

Sub SetItem(pIndex As Integer, pValue As T)
   Dim _item As TTItem<T> = me.GetWrapper(pIndex)
   If Assigned(_item) Then _item.Value = pValue
End Sub

Sub Add(pID As String, pValue As T)
   me._base.Add(New TTItem<T>(pID, pValue))
End Sub

Sub Add(pValue As T)
   me.Add("", pValue)
End Sub

Sub Insert(pIndex As Integer, pID As String, pValue As T)
   me._base.Insert(pIndex, pID, New TTItem<T>(pID, pValue))
End Sub

Sub Insert(pIndex As Integer, pValue As T)
   me.Insert(pIndex, "", pValue)
End Sub

Function Take(pIndex As Integer) As T
   Dim _item As TTItem<T> = me.GetWrapper(pIndex)
   If Assigned(_item) Then Take = _item.Value Else Take = Unassigned
End Function

Function Take(pID As String) As T
   Dim _item As TTItem<T> = CType(me._base.TakeFromId(pID), TTItem<T>)
   If Assigned(_item) Then Take = _item.Value Else Take = Unassigned
End Function

Function First() As T
   Dim _item As TTItem<T> = CType(me._base.First(), TTItem<T>)
   If Assigned(_item) Then First = _item.Value Else First = Unassigned
End Function

Function Last() As T
   Dim _item As TTItem<T> = CType(me._base.Last(), TTItem<T>)
   If Assigned(_item) Then Last = _item.Value Else Last = Unassigned
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
   Dim i As Integer, _count As Integer = me.Count
   For i = 0 To _count - 1
      If pHandler(me.Take(i), i, extra)
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
   Dim i As Integer, _count As Integer = me.Count
   For i = 0 To _count - 1
      If pHandler(me.Take(i), i, extra)
      Find = me.Take(i)
      Exit Function
   End If
Next
Find = Unassigned
End Function

Function Filter(pHandler As TFindDel<T>) As TTList<T>
   Filter = me.Filter(pHandler, "")
End Function

Function Filter(pHandler As TFindDel<T>, extra As Variant) As TTList<T>
   Dim _new As New TTList<T>()
   Dim i As Integer, _count As Integer = me.Count
   For i = 0 To _count - 1
      If pHandler(me.Take(i), i, extra)
      Dim _item As TTItem<T> = me.GetWrapper(i)
      _new.Add(_item.ID, _item.Value)
   End If
Next
Filter = _new
End Function

Sub ForEach(pHandler As TForEachDel<T>)
   me.ForEach(pHandler, "")
End Sub

Sub ForEach(pHandler As TForEachDel<T>, extra As Variant)
   Dim i As Integer, _count As Integer = me.Count
   For i = 0 To _count - 1
      pHandler(me.Take(i), i, extra)
   Next
End Sub

Function Map(pHandler As TMapDel<T>) As TTList<T>
   Map = me.Map(pHandler, "")
End Function

Function Map(pHandler As TMapDel<T>, extra As Variant) As TTList<T>
   Dim _new As New TTList<T>()
   Dim i As Integer, _count As Integer = me.Count
   For i = 0 To _count - 1
      Dim _item As TTItem<T> = me.GetWrapper(i)
      Dim _newValue As T = pHandler(_item.Value, i, extra)
      _new.Add(_item.ID, _newValue)
   Next
   Map = _new
End Function

Sub Free()
   MyBase.Free()
End Sub

End Class

Class TTListObj<T As TTObject>
   Inherits TTComposerList

   Sub New()
      MyBase.New(me.Classname(), True)
   End Sub

   Function GetItem(pIndex As Integer) As T
      GetItem = me.Take(pIndex)
   End Function

   Sub Add(pID As String, pValue As T)
      me._base.Add(pID, pValue)
   End Sub

   Sub Add(pValue As T)
      me.Add("", pValue)
   End Sub

   Sub Insert(pIndex As Integer, pID As String, pValue As T)
      me._base.Insert(pIndex, pID, pValue)
   End Sub

   Sub Insert(pIndex As Integer, pValue As T)
      me.Insert(pIndex, "", pValue)
   End Sub

   Function Take(pIndex As Integer) As T
      Take = CType(me._base.Take(pIndex), T)
   End Function

   Function Take(pID As String) As T
      Take = CType(me._base.TakeFromId(pID), T)
   End Function

   Function First() As T
      First = me.GetItem(0)
   End Function

   Function Last() As T
      Last = me.GetItem(me.Count - 1)
   End Function

   Function Clone() As TTListObj<T>
      Dim _new As New TTListObj<T>(me.Name)
      _new._base = me._base.Clone()
      Clone = _new
   End Function

   Function First(pLimit As Integer) As TTListObj<T>
      Dim _new As New TTListObj<T>(me.Name)
      _new._base = me._base.Range(pLimit, False)
      First = _new
   End Function

   Function Last(pLimit As Integer) As TTListObj<T>
      Dim _new As New TTListObj<T>(me.Name)
      _new._base = me._base.Range(pLimit, True)
      Last = _new
   End Function

   Function IndexOf(pHandler As TFindDel<T>) As Integer
      IndexOf = me.IndexOf(pHandler, "")
   End Function

   Function IndexOf(pHandler As TFindDel<T>, extra As Variant) As Integer
      Dim value As Integer = -1
      Dim i As Integer, _count As Integer = me.Count
      For i = 0 To _count - 1
         If pHandler(me.Take(i), i, extra)
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
   Dim i As Integer, _count As Integer = me.Count
   For i = 0 To _count - 1
      If pHandler(me.Take(i), i, extra)
      Find = me.Take(i)
      Exit Function
   End If
Next
Find = NULL
End Function

Function Filter(pHandler As TFindDel<T>) As TTListObj<T>
   Filter = me.Filter(pHandler, "")
End Function

Function Filter(pHandler As TFindDel<T>, extra As Variant) As TTListObj<T>
   Dim _new As New TTListObj<T>()
   Dim i As Integer, _count As Integer = me.Count
   For i = 0 To _count - 1
      If pHandler(me.Take(i), i, extra)
      _new.Add(me.GetItem(i))
   End If
Next
Filter = _new
End Function

Sub ForEach(pHandler As TForEachDel<T>)
   me.ForEach(pHandler, "")
End Sub

Sub ForEach(pHandler As TForEachDel<T>, extra As Variant)
   Dim i As Integer, _count As Integer = me.Count
   For i = 0 To _count - 1
      pHandler(me.Take(i), i, extra)
   Next
End Sub

Function Map(pHandler As TMapDel<T>) As TTListObj<T>
   Map = me.Map(pHandler, "")
End Function

Function Map(pHandler As TMapDel<T>, extra As Variant) As TTListObj<T>
   Dim _new As New TTListObj<T>()
   Dim i As Integer, _count As Integer = me.Count
   For i = 0 To _count - 1
      _new.Add(pHandler(me.Take(i), i, extra))
   Next
   Map = _new
End Function

Sub Free()
   MyBase.Free()
End Sub

End Class
End Namespace