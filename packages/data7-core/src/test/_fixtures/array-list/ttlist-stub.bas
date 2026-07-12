Namespace mod_tlist
   Delegate Function TFindDel<T>(pValue As T, i As Integer, extra As Variant) As Boolean
   Delegate Function TMapDel<T, TOut>(pValue As T, i As Integer, extra As Variant) As TOut
   Delegate Sub TForEachDel<T>(pValue As T, i As Integer, extra As Variant)
   Delegate Function TReduceDel<T, TAcc>(pAcc As TAcc, pItem As T, extra As Variant) As TAcc

   Class TTList<T>
      Property Length As Integer
      End Property

      Sub New()
         MyBase.New()
      End Sub

      Sub Push(pValue As T)
      End Sub

      Sub Unshift(pValue As T)
      End Sub

      Function GetItem(pIndex As Integer) As T
      End Function

      Sub SetItem(pIndex As Integer, pValue As T)
      End Sub

      Function First() As T
      End Function

      Function Last() As T
      End Function

      Function First(pLimit As Integer) As TTList<T>
      End Function

      Function Last(pLimit As Integer) As TTList<T>
      End Function

      Function Slice(pStart As Integer, pEnd As Integer) As TTList<T>
      End Function

      Function Includes(pValue As T) As Boolean
      End Function

      Function IndexOf(pHandler As TFindDel<T>) As Integer
      End Function

      Function Find(pHandler As TFindDel<T>) As T
      End Function

      Function Filter(pHandler As TFindDel<T>) As TTList<T>
      End Function

      Function Map<TOut>(pHandler As TMapDel<T, TOut>) As TTList<TOut>
      End Function

      Function Some(pHandler As TFindDel<T>) As Boolean
      End Function

      Function Every(pHandler As TFindDel<T>) As Boolean
      End Function

      Function Reduce<TAcc>(pHandler As TReduceDel<T, TAcc>, pInitial As TAcc) As TAcc
      End Function

      Sub ForEach(pHandler As TForEachDel<T>)
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
