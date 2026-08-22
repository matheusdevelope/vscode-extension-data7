' @example: sugar/array-list/05-parameter-array-sugar
' @demonstrates: array sugar em parâmetros — pList[] As T materializa TTList_T; pList(i) vira GetItem(i)
' @diagnostics: none
'
Imports mod_tlist

Namespace mod_testes_array_param
   Class GridBuilder
      Function Columns(pColumns[] As String) As Boolean
         Dim count As Integer = pColumns.Count
         If count = 0 Then
            Columns = False
            Exit Function
         End If
         Dim first As String = pColumns(0)
         Columns = first <> ""
      End Function

      Sub SetColumns(pColumns[] As String)
         Dim i As Integer
         For i = 0 To pColumns.Length - 1
            me.Name = pColumns(i)
         Next
      End Sub

      Sub Configure(ByRef pColumns[] As String)
         pColumns.Push("extra")
         pColumns(0) = "first"
      End Sub

      Sub New()
         MyBase.New()
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
