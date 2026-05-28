' @example: sugar/null-coalesce/01-dim-assignment
' @demonstrates: ?? em Dim — expandido para If/Then/Else multi-linha
' @diagnostics: none
' @transpiled-to: sugar/null-coalesce/_expected/01-dim-assignment.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Run(pName As String)
         Dim nome As String = pName ?? "Anônimo"
         Print nome
      End Sub
   End Class
End Namespace
