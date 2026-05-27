' @example: diagnostics/invalid-interpolation/trigger
' @demonstrates: string interpolada com `{}` vazio — parser não consegue produzir expansão
' @diagnostics: invalid-interpolation@8
'
Namespace mod_demo
   Class TDemo
      Public Sub Run()
         Dim s = $"falta a expressão aqui: {}"
      End Sub
   End Class
End Namespace
