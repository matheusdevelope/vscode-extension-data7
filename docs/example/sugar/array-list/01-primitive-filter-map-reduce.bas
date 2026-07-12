' @example: sugar/array-list/01-primitive-filter-map-reduce
' @demonstrates: array sugar em primitivos — Filter, Map, Some, Every, IndexOf, Reduce com índice (mod_testes_array_primitivo)
' @diagnostics: none
'
Imports mod_tlist

Namespace mod_testes_array_primitivo
   Class HelperNumero
      Shared Function FindMaiorQue4(pValue As Integer, pIdx As Integer, extra As Variant) As Boolean
         FindMaiorQue4 = pValue > 4
      End Function

      Sub New()
         MyBase.New()
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Sub ExecutarTesteArrayPrimitivo()
      Dim numeros[] As Integer = [1, 2, 3, 4, 5]
      numeros.Push(6)
      numeros.Unshift(0)

      Dim pares[] As Integer = numeros.Filter(
         Function(pItem As Integer) As Boolean pItem Mod 2 = 0
      )

      Dim textos[] As String = numeros.Map<String>(
         Function(pItem As Integer, pIdx As Integer) As String
            Return "Item " & CStr(pIdx) & " = " & CStr(pItem)
         End Function
      )

      Dim temMaiorQue5 As Boolean = numeros.Some(
         Function(pItem As Integer) As Boolean pItem > 5
      )

      Dim todosMaiorOuIgualZero As Boolean = numeros.Every(
         Function(pItem As Integer) As Boolean pItem >= 0
      )

      Dim idxPrimeiroMaiorQue3 As Integer = numeros.IndexOf(
         Function(pItem As Integer) As Boolean pItem > 3
      )

      Dim soma As Integer = numeros.Reduce<Integer>(
         Function(pAcumulador As Integer, pItem As Integer) As Integer
            Return pAcumulador + pItem
         End Function,
         0
      )

      Dim textoConcatenado As String = numeros.Reduce<String>(
         Function(pAcumulador As String, pItem As Integer, pIdx As Integer) As String
            If pIdx > 0 Then
               Return pAcumulador & ", " & CStr(pItem)
            End If
            Return CStr(pItem)
         End Function,
         ""
      )

      Dim numeroEncontradoPorDelegate As Integer = numeros.Find(HelperNumero.FindMaiorQue4)
   End Sub
End Namespace
