' @example: diagnostics/line-continuation-without-break/trigger
' @demonstrates: marcador de continuacao de linha sem quebra efetiva
' @diagnostics: line-continuation-without-break@16
'
Namespace mod_line_continuation
   Class GridLike
      Property Row As Integer
      Property Cells(pCol As Integer, pRow As Integer) As String
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
   Class C
      Public Sub Run()
         Dim g As GridLike
         If g.Cells[1, (g.Row + 1_)] <> "" Then
         End If
      End Sub
      Public Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
