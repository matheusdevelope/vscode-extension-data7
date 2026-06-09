' @example: sugar/destructure-object/_expected/01-basic
' @demonstrates: Forma nativa gerada pelo SugarTranspiler para sugar/destructure-object/01-basic
' @diagnostics: none
'
Imports mod_logger
Namespace mod_demo
   Class TDemo
      Public Sub Run(pessoa As TPessoa)
         Dim Nome = pessoa.Nome
         Dim Idade = pessoa.Idade
         mod_logger.Printe(CStr(Nome) & " " & CStr(Idade))
      End Sub
   End Class
End Namespace
