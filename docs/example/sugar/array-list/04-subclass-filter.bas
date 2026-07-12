' @example: sugar/array-list/04-subclass-filter
' @demonstrates: Filter em subclasse de TTList retorna o tipo concreto (Principal.bas / Pessoas)
' @diagnostics: none
'
Imports mod_tlist

Namespace mod_pessoas
   Class Pessoa
      Idade As Integer

      Sub New()
         MyBase.New()
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Class Pessoas
      Inherits TTList<Pessoa>

      Sub New()
         MyBase.New()
      End Sub

      Sub Free()
         MyBase.Free()
      End Sub
   End Class

   Dim list As New Pessoas()
   list.Push(New Pessoa())
   Dim newList As Pessoas = list.filter(Function(_pessoa As Pessoa) _pessoa.Idade > 40)
End Namespace
