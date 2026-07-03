' @example: diagnostics/mustoverride-not-implemented/trigger
' @demonstrates: classe concreta deve implementar metodo MustOverride herdado
' @diagnostics: mustoverride-not-implemented@11
'
MustInherit Class BaseDemo
   MustOverride Overridable Function Name() As String
   End Function
End Class

Class ChildDemo
   Inherits BaseDemo
End Class
