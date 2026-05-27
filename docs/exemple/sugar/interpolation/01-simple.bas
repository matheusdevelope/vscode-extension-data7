' @example: sugar/interpolation/01-simple
' @demonstrates: $"..." com uma expressão única — vira `"prefix " & (expr)`
' @diagnostics: none
' @transpiled-to: sugar/interpolation/_expected/01-simple.bas
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim nome As String
         nome = "Mundo"
         Dim s As String
         s = $"Olá, {nome}!"
      End Sub
   End Class
End Namespace
