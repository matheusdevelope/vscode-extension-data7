' @example: diagnostics/unknown-member/trigger
' @demonstrates: acesso a propriedade inexistente (typo) — emite unknown-member com "did you mean Align?"
' @diagnostics: unknown-member@11
'
Imports Forms

Namespace mod_consumer
   Class TConsumer
      Public Sub Run()
         Dim f As Form
         f.Aling = 1
      End Sub
   End Class
End Namespace
