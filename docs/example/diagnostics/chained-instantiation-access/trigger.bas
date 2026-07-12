' @example: diagnostics/chained-instantiation-access/trigger
' @demonstrates: tentativa de encadear acesso a membro diretamente na instanciação (New)
' @diagnostics: chained-instantiation-access@16, chained-instantiation-access@17

Namespace mod_chained
   Class Exemplo
      Public Property Prop As String
      Public Sub Run()
      End Sub
      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class Consumer
      Public Sub Test()
         Dim s As String = New Exemplo().Prop
         New Exemplo().Run()
      End Sub
      Sub Free()
         MyBase.Free()
      End Sub
   End Class
End Namespace
