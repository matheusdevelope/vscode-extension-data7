
Imports console
Imports mod_base_list

Namespace core_sugars_list_teste2

   Dim _list1 As CoreSugarListPrimitive<Integer> = New CoreSugarListPrimitive<Integer>()
   ' Dim _list2 As CoreSugarListObject<Produto> = New CoreSugarListObject<Produto>()
   ' Dim _list3 As CoreSugarListObject<Produto> = New CoreSugarListObject<Produto>()

   Class Produto
      Inherits BaseItem

      ID As Integer
      Descricao As String

      Sub New(pID As Integer, pDescricao As String)
         MyBase.New()
         me.ID = pID
         me.Descricao = pDescricao
      End Sub
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class TWrapperPrimitive<T1 As TPrimitive>
      Inherits BaseItem

      Value As T1

      Sub New(pValue As T1)
         MyBase.New()
         me.Value = pValue
      End Sub

      Sub Fill(pValue As TWrapperPrimitive<T1>)
         If pValue = NULL Then
            Exit Sub
         End If
         me.Value = pValue.Value
      End Sub

      Overrides Function Copy() As TWrapperPrimitive<T1>
      Copy = New TWrapperPrimitive<T1>(me)
   End Function

   Overrides Function GetID() As String
   GetID  = Cstr(me.GetHashCode)
End Function

Overrides Function ToString(pPrint As Boolean = False) As String
With console.Block(me.Classname)
.Prop("Value", me.Value)
.Close()
.Printe(pPrint)
ToString = .Text
.Free()
End With
End Function

Overrides Sub Dispose()
me.Value = Unassigned
End Sub

Sub Free()
   MyBase.Free()
End Sub

End Class

Class CoreSugarListPrimitive<T2 As TPrimitive>
   Inherits CoreSugaBaseList<TPrimitive, TWrapperPrimitive<T2>>

   Sub New()
      MyBase.New("CoreSugarListPrimitive", false)
   End Sub

   Sub Add(pItem As T2)
      MyBase.Add(New TWrapperPrimitive<T2>(pItem))
   End Sub

   Function Take(pIndex As Integer) As T2
      Take = TWrapperPrimitive<T2>(MyBase.Take(pIndex)).Value
   End Function
End Function

Function Take(pID As String) As T2
   Take = TWrapperPrimitive<T2>(MyBase.TakeFromId(pID)).Value
End Function

Function First() As T2
   First = TWrapperPrimitive<T2>(MyBase.First).Value
End Function

Function Last() As T2
   Last = TWrapperPrimitive<T2>(MyBase.Last).Value
End Function

Sub Free()
   MyBase.Free()
End Sub

End Class

' Class TWrapperObject<T3 As TObject>
'    Inherits BaseItem

'    Value As T3

'    Sub New(pValue As T3)
'       MyBase.New()
'       me.Value = pValue
'    End Sub

'    Sub Fill(pValue As TWrapperObject<T3>)
'       If pValue = NULL Then
'          Exit Sub
'       End If
'       me.Value = pValue.Value
'    End Sub

'    Overrides Function Copy() As TWrapperObject<T3>
'    Copy = New TWrapperObject<T3>(me)
' End Function

' Overrides Function GetID() As String
' GetID  = Cstr(me.Value.GetHashCode)
' End Function

' Overrides Function ToString(pPrint As Boolean = False) As String
' With console.Block(me.Classname)
' .Prop("Value", me.Value)
' .Close()
' .Printe(pPrint)
' ToString = .Text
' .Free()
' End With
' End Function

' Overrides Sub Dispose()
' If me.Value <> NULL Then
'    me.Value.Free()
' End If
' me.Value = NULL
' End Sub

' Sub Free()
'    MyBase.Free()
' End Sub

' End Class

' Class CoreSugarListObject<T4 As TObject>
'    Inherits CoreSugaBaseList<TObject, T4>

'    Sub New()
'       MyBase.New("CoreSugarListObject", false)
'    End Sub

'    Sub Add(pItem As T4)
'       MyBase.Add(New TWrapperObject<T4>(pItem))
'    End Sub

'    Function Take(pIndex As Integer) As T4
'       Take = TWrapperObject<T4>(MyBase.Take(pIndex)).Value
'    End Function

'    Function Take(pID As String) As T4
'       Take = TWrapperObject<T4>(MyBase.TakeFromId(pID)).Value
'    End Function

'    Function First() As T4
'       First = TWrapperObject<T4>(MyBase.First).Value
'    End Function

'    Function Last() As T4
'       Last = TWrapperObject<T4>(MyBase.Last).Value
'    End Function

'    Sub Free()
'       MyBase.Free()
'    End Sub

' End Class

Delegate Function CoreSugaBaseListFindDelegate<T5 As TObject>( pValue As T5, i As Integer, extra As Variant) As Boolean
Delegate Function CoreSugaBaseListMapDelegate<T6 As TObject>(pValue As T6, i As Integer, extra As Variant) As T6
Delegate Sub CoreSugaBaseListForEachDelegate<T7 As TObject>(pValue As T7, i As Integer, extra As Variant)

Private Class CoreSugaBaseList<T8 As TObject, K1 As BaseItem>
   Inherits BaseList

   Sub New(pName As String, pOwnsObjects As Boolean)
      MyBase.New(pName, pOwnsObjects)
   End Sub

   Property Item(pIndex As Integer) As K1
      Get
         Item = CType(MyBase.Take(pIndex), K1)
      End Get
      Set(pValue As K1)
      me.SetItem(pIndex, pValue)
   End Set
End Property

Function Take(pIndex As Integer) As K1
   Take = CType(MyBase.Take(pIndex), K1)
End Function

Function Take(pID As String) As K1
   Take = CType(MyBase.TakeFromId(pID), K1)
End Function

Function First() As K1
   First = CType(MyBase.First, K1)
End Function

Function First(pLimit As Integer) As CoreSugaBaseList<T8, K1>
   First = CType(MyBase.Range(pLimit, False), CoreSugaBaseList<T8, K1>)
End Function

Function Last() As K1
   Last = CType(MyBase.Last, K1)
End Function

Function Last(pLimit As Integer) As CoreSugaBaseList<T8, K1>
   Last = CType(MyBase.Range(pLimit, True), CoreSugaBaseList<T8, K1>)
End Function

Function Copy() As CoreSugaBaseList<T8, K1>
   Copy = CType(MyBase.Copy(), CoreSugaBaseList<T8, K1>)
End Function

Function IndexOf(handler As CoreSugaBaseListFindDelegate<K1>) As Integer
   IndexOf = me.IndexOf(handler, "")
End Function

Function IndexOf(handler As CoreSugaBaseListFindDelegate<K1>, extra As Variant) As Integer
   IndexOf = MyBase.IndexOf(handler, extra)
End Function

Function Find(handler As CoreSugaBaseListFindDelegate<K1>) As CoreSugaBaseList<T8, K1>
   Find = me.Find(handler, "")
End Function

Function Find(handler As CoreSugaBaseListFindDelegate<K1>, extra As Variant) As CoreSugaBaseList<T8, K1>
   Find = CType(MyBase.Find(handler, extra), CoreSugaBaseList<T8, K1>)
End Function

Function Filter(handler As CoreSugaBaseListFindDelegate<K1>) As CoreSugaBaseList<T8, K1>
   Return me.Filter(handler, "")
End Function

Function Filter(handler As CoreSugaBaseListFindDelegate<K1>, extra As Variant) As CoreSugaBaseList<T8, K1>
   Filter = CType(MyBase.Filter(handler, extra), CoreSugaBaseList<T8, K1>)
End Function

Sub ForEach(handler As CoreSugaBaseListFindDelegate<K1>)
   me.ForEach(handler, "")
End Sub

Sub ForEach(handler As CoreSugaBaseListForEachDelegate<K1>, extra As Variant)
   MyBase.ForEach(handler, extra)
End Sub

Function Map(handler As CoreSugaBaseListMapDelegate<K1>) As CoreSugaBaseList<T8, K1>
   Map = me.Map(handler, "")
End Function

Function Map(handler As CoreSugaBaseListMapDelegate<K1>, extra As Variant) As CoreSugaBaseList<T8, K1>
   With CType(MyBase.Map(handler, extra), CoreSugaBaseList<T8, K1>)
   Map = .Copy()
   End With
End Function

Sub Free()
   MyBase.Free()
End Sub

End Class

End Namespace