
Imports Collections

'@Module
Namespace mod_tobject

   Delegate Function FindDel(pValue As TTObject, i As Integer, extra As Variant) As Boolean
   Delegate Function MapDel(pValue As TTObject, i As Integer, extra As Variant) As TTObject
   Delegate Function SortPropDel(pValue As TTObject, i As Integer, extra As Variant) As String
   Delegate Sub ForEachDel(pValue As TTObject, i As Integer, extra As Variant)
   Delegate Sub OnActionListDel(pList As TTObjectList, pItem As TTObject, pIndex As Integer)

   Private Class TTObjectPrinter

      Private _title As String
      Private _lines As StringList
      Private _closed As Boolean
      Private _maxWidth As Integer

      Sub New(pTitle As String, pSize As Integer = 60)
         MyBase.New()
         me._title = pTitle
         me._maxWidth = pSize
         me._lines = New StringList()
         me._closed = False
      End Sub

      Sub Prop(pLabel As String, pValue As Variant)
         me._lines.Add(pLabel + ": " + CStr(pValue))
      End Sub

      Sub Prop(pLabel As String, pValue As TObject)
         me._lines.Add(pLabel + ": " + pValue.ToString())
      End Sub

      Sub Prop(pValue As Variant)
         me._lines.Add(CStr(pValue))
      End Sub

      Sub Prop(pValue As TObject)
         me._lines.Add(pValue.ToString())
      End Sub

      Sub Close()
         If Not _closed Then
            Dim padding As Integer = me._maxWidth - me._title.Length - 2
            If padding < 0 Then padding = 0
            Dim leftPad As Integer = Int(padding / 2)
            Dim rightPad As Integer = padding - leftPad
            Dim _str As String = " "
            Dim topLine As String = Char(13) + _str.StringOfChar("_", leftPad) + " " + _title + " " + _str.StringOfChar("_", rightPad)
            Dim bottomLine As String = _str.StringOfChar("_", me._maxWidth - 2)
            me._lines.Insert(0, topLine)
            me._lines.Add(bottomLine)
            me._closed = True
         End If
      End Sub

      Function Text() As String
         me.Close()
         Text = me._lines.Text
      End Function

      Sub Free()
         me._lines.Free()
         MyBase.Free()
      End Sub

   End Class

   Class TTObject

      Disposed As Boolean

      OnBeforePush As OnActionListDel
      OnAfterPush As OnActionListDel
      OnBeforeDelete As OnActionListDel
      OnAfterDelete As OnActionListDel
      OnBeforeDispose As OnActionListDel
      OnAfterDispose As OnActionListDel

      Sub New()
         MyBase.New()
      End Sub

      Overridable Sub Assign(pValue As TObject)
         Throw New Exception("You must to implement this method, do NOT use the Overrides, just declare: Sub Assign(pValue As [YouClass])")
      End Sub

      Overridable Function Clone() As TObject
         Throw New Exception("You must to implement this method: Function Clone() As [YouClass]")
      End Function

      Overridable Function GetID() As String
         GetID = CStr(me.GetHashCode)
      End Function

      Overridable Function ToString() As String
         ToString = MyBase.ToString()
      End Function

      Overridable Sub Dispose()
         Throw New Exception("You must to implement this method: Sub Dispose()")
      End Sub

      Private Sub TriggerEvent(pList As TTObjectList, pItem As TTObject, pIndex As Integer, pMethod As OnActionListDel, pDelegate As OnActionListDel)
         If pMethod <> NULL Then pMethod(pList, pItem, pIndex)
         If pDelegate <> NULL Then pDelegate(pList, pItem, pIndex)
      End Sub

      Sub DispatchBeforePush(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
         me.TriggerEvent(pList, pItem, pIndex, me.BeforePush, me.OnBeforePush)
      End Sub

      Sub DispatchAfterPush(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
         me.TriggerEvent(pList, pItem, pIndex, me.AfterPush, me.OnAfterPush)
      End Sub

      Sub DispatchBeforeDelete(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
         me.TriggerEvent(pList, pItem, pIndex, me.BeforeDelete, me.OnBeforeDelete)
      End Sub

      Sub DispatchAfterDelete(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
         me.TriggerEvent(pList, pItem, pIndex, me.AfterDelete, me.OnAfterDelete)
      End Sub

      Sub DispatchBeforeDispose(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
         me.TriggerEvent(pList, pItem, pIndex, me.BeforeDispose, me.OnBeforeDispose)
      End Sub

      Sub DispatchAfterDispose(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
         me.TriggerEvent(pList, pItem, pIndex, me.AfterDispose, me.OnAfterDispose)
      End Sub

      Protected Overridable Sub BeforePush(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
      End Sub
      Protected Overridable Sub AfterPush(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
      End Sub
      Protected Overridable Sub BeforeDelete(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
      End Sub
      Protected Overridable Sub AfterDelete(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
      End Sub
      Protected Overridable Sub BeforeDispose(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
      End Sub
      Protected Overridable Sub AfterDispose(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
      End Sub

      Protected Function BuildLogger(pTitle As String, pSize As Integer = 60) As TTObjectPrinter
         BuildLogger = New TTObjectPrinter(pTitle, pSize)
      End Function

     Public Sub Free()
       MyBase.Free()
     End Sub

   End Class

   Class TTBaseList
      Sub New()
         MyBase.New()
      End Sub
      Overridable Property Length As Integer
         Get
            Throw New Exception("You must to implement this property: Property Length As Integer")
         End Get
      End Property
      Overridable Function Take(pIndex As Integer) As TTObject
         Throw New Exception("You must to implement this method: Function Take(pIndex As Integer) As TTObject")
      End Function
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TTObjectList
      Inherits TTBaseList

      Name As String
      Private _list As StringList
      Private _disposed As Boolean

      OnBeforePush As OnActionListDel
      OnAfterPush As OnActionListDel
      OnBeforeDelete As OnActionListDel
      OnAfterDelete As OnActionListDel
      OnBeforeClean As OnActionListDel
      OnAfterClean As OnActionListDel
      OnBeforeDispose As OnActionListDel
      OnAfterDispose As OnActionListDel

      Sub New(pName As String = "TTObjectList", pOwnsObjects As Boolean = True)
         MyBase.New()
         me.Name = pName
         me._list = New StringList()
         me.OwnsObjects = pOwnsObjects
      End Sub

      Private Function CreateInstance() As TTObjectList
         CreateInstance = New TTObjectList(me.Name)
      End Function

      Private Sub SetOwnsObjects(pValue As Boolean)
         me._list.OwnsObjects = pValue
      End Sub

      Private Sub SetSorted(pValue As Boolean)
         me._list.Sorted = pValue
      End Sub

      Property OwnsObjects As Boolean
         Get
            OwnsObjects = me._list.OwnsObjects
         End Get
         Set(pValue As Boolean)
            me.SetOwnsObjects(pValue)
         End Set
      End Property

      Property Sorted As Boolean
         Set(pValue As Boolean)
            me.SetSorted(pValue)
         End Set
      End Property

      Property Item(pIndex As Integer) As TTObject
         Get
            Item = CType(me._list.Objects(pIndex), TTObject)
         End Get
         Set(pValue As TTObject)
            me.SetItem(pIndex, pValue)
         End Set
      End Property

      Protected Sub SetItem(pIndex As Integer, pValue As TTObject)
         me._list.Objects(pIndex) = pValue
      End Sub

      Sub Push(pID As String, pValue As TTObject)
         Dim _index As Integer = me.Length()
         me.DispatchBeforePush(me, pValue, _index)
         Dim _id As String = UCase(pID)
         me._list.AddObject(_id, pValue)
         me.DispatchAfterPush(me, pValue, _index)
      End Sub

      Sub Push(pValue As TTObject)
         me.Push(pValue.GetID, pValue)
      End Sub

      Sub Push(pValues As TTComposerList)
         Dim i As Integer, _length As Integer = pValues.Length
         For i = 0 To _length - 1
             me.Push(pValues.Take(i))
         Next
      End Sub

      Sub Unshift(pValue As TTObject)
         me.Unshift(0, pValue)
      End Sub

      Sub Unshift(pIndex As Integer, pID As String, pValue As TTObject)
          me.DispatchBeforePush(me, pValue, pIndex)
          pID = UCase(pID)
          me._list.InsertObject(pIndex, pID, pValue)
          me.DispatchAfterPush(me, pValue, pIndex)
      End Sub

      Sub Unshift(pIndex As Integer, pValue As TTObject)
          me.Unshift(pIndex, pValue.GetID, pValue)
      End Sub

      Sub Unshift(pIndex As Integer, pValues As TTComposerList)
         Dim i As Integer, _length As Integer = pValues.Length - 1
         For i = 0 To _length
             me.Unshift(pIndex + i, pValues.Item(i))
         Next
      End Sub

      Function Take(pID As String) As TTObject
         Take = me.Take(me.IndexOf(pID))
      End Function

      Function Take(pIndex As Integer) As TTObject
         Take = CType(me._list.Objects(pIndex), TTObject)
      End Function

      Function TakeFromId(pID As String) As TTObject
         TakeFromId = me.Take(pID)
      End Function

      Function Includes(pID As String) As Boolean
         Includes = me.IndexOf(pID) <> -1
      End Function

      Function IndexOf(pID As String) As Integer
         pID = UCase(pID)
         IndexOf = me._list.IndexOf(pID)
      End Function

      Function IndexOf(pHandler As FindDel) As Integer
         IndexOf = me.IndexOf(pHandler, "")
      End Function

      Function IndexOf(pHandler As FindDel, extra As Variant) As Integer
         Dim value As Integer = -1
         Dim i As Integer, _length As Integer = me.Length()
         For i = 0 To _length - 1
             If pHandler(me.Take(i), i, extra) Then
                value = i
                Exit For
             End IF
         Next
         IndexOf = value
      End Function

      Function Find(pHandler As FindDel) As TObject
         Find = me.Find(pHandler, "")
      End Function

      Function Find(pHandler As FindDel, extra As Variant) As TObject
         Dim value As TObject
         Dim i As Integer, _length As Integer = me.Length()
         For i = 0 To _length - 1
             If pHandler(me.Take(i), i, extra) Then
                value = me.Take(i)
                Exit For
             End IF
         Next
         Find = value
      End Function

      Function Filter(pHandler As FindDel) As TTObjectList
         Filter = me.Filter(pHandler, "")
      End Function

      Function Filter(pHandler As FindDel, extra As Variant) As TTObjectList
         Dim _new As TTObjectList = me.CreateInstance()
         Dim i As Integer, _length As Integer = me.Length()
         For i = 0 To _length - 1
             If pHandler(me.Take(i), i, extra) Then
                _new.Push(me.Take(i))
             End IF
         Next
         Filter = _new
      End Function

      Sub ForEach(pHandler As FindDel)
         me.ForEach(pHandler, "")
      End Sub

      Sub ForEach(pHandler As ForEachDel, extra As Variant)
         Dim i As Integer, _length As Integer = me.Length()
         For i = 0 To _length - 1
             pHandler(me.Take(i), i, extra)
         Next
      End Sub

      Function Map(pHandler As FindDel) As TTObjectList
         Map = me.Map(pHandler, "")
      End Function

      Function Map(pHandler As MapDel, extra As Variant) As TTObjectList
         Dim _new As TTObjectList = me.CreateInstance()
         Dim i As Integer, _length As Integer = me.Length()
         For i = 0 To _length - 1
             _new.Push(pHandler(me.Take(i), i, extra))
         Next
         Map = _new
      End Function

      Function First() As TTObject
         If me.Length() > 0 Then
            First = me.Take(0)
            Exit Function
         End If
         First = NULL
      End Function

      Function Last() As TTObject
         Dim _length As Integer = me.Length()
         If _length > 0 Then
            Last = me.Take(_length - 1)
            Exit Function
         End If
         Last = NULL
      End Function

      Function Clone() As TTObjectList
         Dim _Clone As New TTObjectList(), i As Integer, _length As Integer = me.Length()
         For i = 0 To _length - 1
            _Clone.Push(CType(me.Take(i).Clone(), TTObject))
         Next
         Clone = _Clone
      End Function

      Function Range(pLimit As Integer, fromEnd As Boolean) As TTObjectList
         Dim result As TTObjectList = me.CreateInstance()
         Dim _length As Integer = me.Length()
         If pLimit <= 0 Or _length = 0 Then
            Range = result
         End If
         Dim i As Integer, startIndex As Integer = 0, idx As Integer
         If fromEnd Then
            startIndex = _length - pLimit
         End If
         If startIndex < 0 Then
            startIndex = 0
         End If
         For i = 0 To pLimit - 1
            If fromEnd Then
               idx = startIndex + i
            Else
               idx = i
            End If
            If idx >= 0 And idx < _length Then
               result.Push(me.Take(idx))
            End If
         Next
         Range = result
      End Function

      Function Length() As Integer
         Length = me._list.Count
      End Function

      Function Pop() As TTObject
         Dim _len As Integer = me.Length()
         If _len > 0 Then
            Pop = me.Extract(_len - 1)
         Else
            Pop = NULL
         End If
      End Function

      Function Shift() As TTObject
         Dim _len As Integer = me.Length()
         If _len > 0 Then
            Shift = me.Extract(0)
         Else
            Shift = NULL
         End If
      End Function

      Function Splice(pStart As Integer, pQty As Integer) As TTObjectList
         Dim _new As TTObjectList = me.CreateInstance()
         Dim _len As Integer = me.Length()

         If pStart < 0 Then pStart = _len + pStart
         If pStart < 0 Then pStart = 0

         Dim i As Integer
         For i = 0 To pQty - 1
            If pStart >= me.Length() Then Exit For
            _new.Push(me.Extract(pStart))
         Next
         Splice = _new
      End Function

      Function Slice(pStart As Integer, pEnd As Integer) As TTObjectList
         Dim _new As TTObjectList = me.CreateInstance()
         Dim _len As Integer = me.Length()

         If pStart < 0 Then pStart = _len + pStart
         If pStart < 0 Then pStart = 0
         If pEnd < 0 Then pEnd = _len + pEnd
         If pEnd > _len Then pEnd = _len

         Dim i As Integer
         For i = pStart To pEnd - 1
            _new.Push(CType(me.Take(i).Clone(), TTObject))
         Next
         Slice = _new
      End Function

      Sub Reverse()
         Dim i As Integer = 0
         Dim j As Integer = me.Length() - 1
         While i < j
            me._list.Exchange(i, j)
            i = i + 1
            j = j - 1
         End While
      End Sub

      Function Extract(pIndex As Integer) As TTObject
         Dim _item As TTObject = me.Take(pIndex)
         Dim _tempOwns As Boolean = me.OwnsObjects

         me.OwnsObjects = False
         me.Delete(pIndex)
         me.OwnsObjects = _tempOwns

         Extract = _item
      End Function

      Sub Delete(pIndex as Integer)
         Dim _item As TTObject = me.Take(pIndex)
         me.DispatchBeforeDelete(me, _item, pIndex)
         Dim _id As String = UCase(_item.GetID)
         me._list.Delete(pIndex)
         me.DispatchAfterDelete(me, _item, pIndex)
      End Sub

      Sub Delete(pID As String)
         me.Delete(me.IndexOf(pID))
      End Sub

      Sub Clean(pDispose As Boolean = True)
         me.DispatchBeforeClean(me, NULL, -1)
         If pDispose Then
            me.Dispose()
            me._disposed = False
         End If
         me._list.Clear()
         me.DispatchAfterClean(me, NULL, -1)
      End Sub

      Sub Sort(pHandler As SortPropDel, pAsc As Boolean = True)
         me.Sort(pHandler, pAsc, "")
      End Sub

      Sub Sort(pHandler As SortPropDel, pAsc As Boolean = True, pExtra As Variant)
         If pHandler <> NULL Then
            Dim listTemp As New StringList, i As Integer
            Dim _length As Integer = me.Length()
            For i = 0 To _length - 1
               Dim _item As TObject = me._list.Objects(i)
               Dim prop_value As String = pHandler(CType(_item, TTObject), i, pExtra)
               listTemp.AddObject(prop_value, _item)
            Next
            listTemp.Sorted = True
            Dim tempOwnsObjects As Boolean = me.OwnsObjects
            me.OwnsObjects = False
            me.Clean()
            _length = listTemp.Count
            For i = 0 To _length - 1
               Dim idx As Integer = i
               If Not pAsc Then
                  idx = _length - i - 1
               End If
               me.Push(CType(listTemp.Objects(idx), TTObject))
            Next
            me.OwnsObjects = tempOwnsObjects
            listTemp.Free()
         Else
            Throw New Exception("You must send a handler")
         End If
         Exit Sub
      End Sub

      Function ToString() As String
         Dim i As Integer, _length As Integer = me.Length()
         With New TTObjectPrinter(me.Name + " Length: " + _length.ToString)
            For i = 0 To _length - 1
               .Prop(me.Take(i).ToString())
            Next
            .Close()
            ToString = .Text
            .Free()
         End With
      End Function

      Private Sub TriggerEvent(pList As TTObjectList, pItem As TTObject, pIndex As Integer, pMethod As OnActionListDel, pDelegate As OnActionListDel)
         If pMethod <> NULL Then pMethod(pList, pItem, pIndex)
         If pDelegate <> NULL Then pDelegate(pList, pItem, pIndex)
      End Sub

      Private Sub DispatchBeforePush(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
         If pItem <> NULL Then pItem.DispatchBeforePush(pList, pItem, pIndex)
         me.TriggerEvent(pList, pItem, pIndex, me.BeforePush, me.OnBeforePush)
      End Sub

      Private Sub DispatchAfterPush(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
         If pItem <> NULL Then pItem.DispatchAfterPush(pList, pItem, pIndex)
         me.TriggerEvent(pList, pItem, pIndex, me.AfterPush, me.OnAfterPush)
      End Sub

      Private Sub DispatchBeforeDelete(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
         If pItem <> NULL Then pItem.DispatchBeforeDelete(pList, pItem, pIndex)
         me.TriggerEvent(pList, pItem, pIndex, me.BeforeDelete, me.OnBeforeDelete)
      End Sub

      Private Sub DispatchAfterDelete(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
         If pItem <> NULL Then pItem.DispatchAfterDelete(pList, pItem, pIndex)
         me.TriggerEvent(pList, pItem, pIndex, me.AfterDelete, me.OnAfterDelete)
      End Sub

      Private Sub DispatchBeforeClean(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
         me.TriggerEvent(pList, pItem, pIndex, me.BeforeClean, me.OnBeforeClean)
      End Sub

      Private Sub DispatchAfterClean(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
         me.TriggerEvent(pList, pItem, pIndex, me.AfterClean, me.OnAfterClean)
      End Sub

      Private Sub DispatchBeforeDispose(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
         If pItem <> NULL Then pItem.DispatchBeforeDispose(pList, pItem, pIndex)
         me.TriggerEvent(pList, pItem, pIndex, me.BeforeDispose, me.OnBeforeDispose)
      End Sub

      Private Sub DispatchAfterDispose(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
         If pItem <> NULL Then pItem.DispatchAfterDispose(pList, pItem, pIndex)
         me.TriggerEvent(pList, pItem, pIndex, me.AfterDispose, me.OnAfterDispose)
      End Sub

      Protected Overridable Sub BeforePush(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
      End Sub
      Protected Overridable Sub AfterPush(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
      End Sub
      Protected Overridable Sub BeforeDelete(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
      End Sub
      Protected Overridable Sub AfterDelete(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
      End Sub
      Protected Overridable Sub BeforeClean(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
      End Sub
      Protected Overridable Sub AfterClean(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
      End Sub
      Protected Overridable Sub BeforeDispose(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
      End Sub
      Protected Overridable Sub AfterDispose(pList As TTObjectList, pItem As TTObject, pIndex As Integer)
      End Sub

      Sub Dispose()
         If Not me._disposed Then
            Dim i As Integer, _length As Integer = me.Length()
            For i = 0 To _length - 1
               Dim _item As TTObject = me.Take(i)
               If Not _item.Disposed Then
                  me.DispatchBeforeDispose(me, _item, i)
                  _item.Dispose()
                  _item.Disposed = True
                  me.DispatchAfterDispose(me, _item, i)
               End If
            Next
         End If
      End Sub

      Sub Free(pDispose As Boolean = True)
         If pDispose Then me.Dispose()
         If Assigned(me._list) Then
            Try
               me._list.Free()
            Catch ex As Exception
               me._list.OwnsObjects = False
               me._list.Free()
            End Try
         End If
         MyBase.Free()
      End Sub

   End Class

   Class TTComposerList
      Inherits TTBaseList

      Protected _base As TTObjectList

      Sub New(pName As String, pOwnsObjects As Boolean = True)
         MyBase.New()
         me._base = New TTObjectList(pName, pOwnsObjects)
      End Sub

      Property Name As String
         Get
            Name = me._base.Name
         End Get
         Set(pValue As String)
            me._SetName(pValue)
         End Set
      End Property

      Private Sub _SetName(pValue As String)
         me._base.Name = pValue
      End Sub

      Overrides Property Length As Integer
         Get
            Length = me._base.Length()
         End Get
      End Property
      Property Item(pIndex As Integer) As TTObject
         Get
            Item = me._base.Item(pIndex)
         End Get
         Set(pValue As TTObject)
            me._base.Item(pIndex) = pValue
         End Set
      End Property

      Property OwnsObjects As Boolean
         Get
            OwnsObjects = me._base.OwnsObjects
         End Get
         Set(pValue As Boolean)
            me._SetOwnsObjects(pValue)
         End Set
      End Property

      Private Sub _SetOwnsObjects(pValue As Boolean)
         me._base.OwnsObjects = pValue
      End Sub

      Property Sorted As Boolean
         Set(pValue As Boolean)
            me._SetSorted(pValue)
         End Set
      End Property

      Private Sub _SetSorted(pValue As Boolean)
         me._base.Sorted = pValue
      End Sub

      Function Includes(pID As String) As Boolean
         Includes = me._base.Includes(pID)
      End Function

      Function IndexOf(pID As String) As Integer
         IndexOf = me._base.IndexOf(pID)
      End Function

      Sub Reverse()
         me._base.Reverse()
      End Sub

      Sub Delete(pIndex As Integer)
         me._base.Delete(pIndex)
      End Sub

      Sub Delete(pID As String)
         me._base.Delete(pID)
      End Sub

      Sub Clean(pDispose As Boolean = True)
         me._base.Clean(pDispose)
      End Sub

      Sub Free()
         If Assigned(me._base) Then me._base.Free()
         MyBase.Free()
      End Sub

      Function ToString() As String
         ToString = me._base.ToString()
      End Function

      Property OnBeforePush As OnActionListDel
         Get
            OnBeforePush = me._base.OnBeforePush
         End Get
         Set(pValue As OnActionListDel)
            me._SetOnBeforePush(pValue)
         End Set
      End Property

      Private Sub _SetOnBeforePush(pValue As OnActionListDel)
         me._base.OnBeforePush = pValue
      End Sub

      Property OnAfterPush As OnActionListDel
         Get
            OnAfterPush = me._base.OnAfterPush
         End Get
         Set(pValue As OnActionListDel)
            me._SetOnAfterPush(pValue)
         End Set
      End Property

      Private Sub _SetOnAfterPush(pValue As OnActionListDel)
         me._base.OnAfterPush = pValue
      End Sub

      Property OnBeforeDelete As OnActionListDel
         Get
            OnBeforeDelete = me._base.OnBeforeDelete
         End Get
         Set(pValue As OnActionListDel)
            me._SetOnBeforeDelete(pValue)
         End Set
      End Property

      Private Sub _SetOnBeforeDelete(pValue As OnActionListDel)
         me._base.OnBeforeDelete = pValue
      End Sub

      Property OnAfterDelete As OnActionListDel
         Get
            OnAfterDelete = me._base.OnAfterDelete
         End Get
         Set(pValue As OnActionListDel)
            me._SetOnAfterDelete(pValue)
         End Set
      End Property

      Private Sub _SetOnAfterDelete(pValue As OnActionListDel)
         me._base.OnAfterDelete = pValue
      End Sub

      Property OnBeforeClean As OnActionListDel
         Get
            OnBeforeClean = me._base.OnBeforeClean
         End Get
         Set(pValue As OnActionListDel)
            me._SetOnBeforeClean(pValue)
         End Set
      End Property

      Private Sub _SetOnBeforeClean(pValue As OnActionListDel)
         me._base.OnBeforeClean = pValue
      End Sub

      Property OnAfterClean As OnActionListDel
         Get
            OnAfterClean = me._base.OnAfterClean
         End Get
         Set(pValue As OnActionListDel)
            me._SetOnAfterClean(pValue)
         End Set
      End Property

      Private Sub _SetOnAfterClean(pValue As OnActionListDel)
         me._base.OnAfterClean = pValue
      End Sub

      Property OnBeforeDispose As OnActionListDel
         Get
            OnBeforeDispose = me._base.OnBeforeDispose
         End Get
         Set(pValue As OnActionListDel)
            me._SetOnBeforeDispose(pValue)
         End Set
      End Property

      Private Sub _SetOnBeforeDispose(pValue As OnActionListDel)
         me._base.OnBeforeDispose = pValue
      End Sub

      Property OnAfterDispose As OnActionListDel
         Get
            OnAfterDispose = me._base.OnAfterDispose
         End Get
         Set(pValue As OnActionListDel)
            me._SetOnAfterDispose(pValue)
         End Set
      End Property

      Private Sub _SetOnAfterDispose(pValue As OnActionListDel)
         me._base.OnAfterDispose = pValue
      End Sub

   End Class

End Namespace
