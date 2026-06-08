Imports mod_tobject

'@Module
Namespace mod_tlist

   Class Produto
      Inherits TTObject
      Codigo As Integer
      Nome As String
      Sub New(pCodigo As Integer, pNome As String)
         MyBase.New()
         me.Codigo = pCodigo
         me.Nome = pNome
      End Sub
      Sub New(pValue As Produto)
         MyBase.New()
         me.Assign(pValue)
      End Sub
      Sub Assign(pValue As Produto)
         If Assigned(pValue) Then
            me.Codigo = pValue.Codigo
            me.Nome = pValue.Nome
         End If
      End Sub
      Overrides Function Clone() As Produto
         Clone = New Produto(me)
      End Function
      Overrides Function GetID() As String
         GetID = CStr(me.Codigo)
      End Function
      Overrides Function ToString() As String
         With me.BuildLogger(me.ClassName)
            .Prop("Codigo", me.Codigo.ToString())
            .Prop("Nome", me.Nome.ToString())
            ToString = .Text()
            .Free()
         End With
      End Function
      Overrides Sub Dispose()
         me.Codigo = Unassigned
         me.Nome = Unassigned
      End Sub
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

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
         me.Value = Unassigned
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
         Unwrap = CType(pObj, T)
         <# Else #>
         Unwrap = TTItem<T>(pObj).Value
         <# End If #>
      End Function

      Function GetItem(pIndex As Integer) As T
         GetItem = me.Take(pIndex)
      End Function

      Sub SetItem(pIndex As Integer, pValue As T)
         me._base.Insert(pIndex, me.Wrap("", pValue))
      End Sub

      Sub Add(pID As String, pValue As T)
         me._base.Add(pID, me.Wrap(pID, pValue))
      End Sub

      Sub Add(pValue As T)
         me.Add("", pValue)
      End Sub

      Sub Insert(pIndex As Integer, pID As String, pValue As T)
         me._base.Insert(pIndex, pID, me.Wrap(pID, pValue))
      End Sub

      Sub Insert(pIndex As Integer, pValue As T)
         me.Insert(pIndex, "", pValue)
      End Sub

      Function Take(pIndex As Integer) As T
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
         Dim i As Integer, _count As Integer = me.Count
         For i = 0 To _count - 1
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
         Dim i As Integer, _count As Integer = me.Count
         For i = 0 To _count - 1
            Dim _value As T = me.Take(i)
            If pHandler(_value, i, extra) Then
               Dim _idOriginal As String = me._base.Take(i).GetID()
               _new.Add(_idOriginal, _value)
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
            Dim _value As T = me.Take(i)
            Dim _idOriginal As String = me._base.Take(i).GetID()
            _new.Add(_idOriginal, pHandler(_value, i, extra))
         Next
         Map = _new
      End Function

      Sub Free()
         MyBase.Free()
      End Sub

   End Class

End Namespace