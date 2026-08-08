' @example: sugar/array-list/05-parameter-array-sugar
' @demonstrates: array sugar em parâmetros de Function/Sub — pList[] As T materializa TTList_T e resolve no escopo
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
         Dim first As String = pColumns.GetItem(0)
         Columns = first <> ""
      End Function

      Sub Configure(ByRef pColumns[] As String)
         pColumns.Push("extra")
      End Sub

      Sub New()
         MyBase.New()
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
