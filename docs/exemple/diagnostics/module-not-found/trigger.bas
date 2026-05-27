' @example: diagnostics/module-not-found/trigger
' @demonstrates: Imports de um módulo que não existe no workspace, repositório privado, nem System Library
' @diagnostics: module-not-found@6
' @requires: nenhum módulo "mod_unknown_module" instalado em lugar nenhum
'
Imports mod_unknown_module

Namespace mod_consumer
   Class TConsumer
      Public Sub Run()
      End Sub
   End Class
End Namespace
