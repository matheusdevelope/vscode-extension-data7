' @example: diagnostics/unsupported-member/trigger
' @demonstrates: acesso a propriedade marcada isUnsupported=true na System Library (não traduzida pelo compilador Data7)
' @diagnostics: unsupported-member@11
'
Imports Forms

Namespace mod_consumer
   Class TConsumer
      Public Sub Run()
         Dim g As Grid
         g.PopupMenu = Nothing
      End Sub
   End Class
End Namespace
