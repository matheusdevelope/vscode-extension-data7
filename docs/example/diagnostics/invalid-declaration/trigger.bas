' @example: diagnostics/invalid-declaration/trigger
' @demonstrates: Overrides exige membro herdado Overridable ou MustOverride
' @diagnostics: invalid-declaration@21
'
Class InvalidDeclarationBaseDemo
   Sub New()
      MyBase.New()
   End Sub
   Sub Name()
   End Sub
   Sub Free()
      MyBase.Free()
   End Sub
End Class

Class InvalidDeclarationChildDemo
   Inherits InvalidDeclarationBaseDemo
   Sub New()
      MyBase.New()
   End Sub
   Overrides Sub Name()
   End Sub
   Sub Free()
      MyBase.Free()
   End Sub
End Class
