' @example: diagnostics/private-member-access/trigger
' @demonstrates: acesso a membro Private de uma classe a partir de outra classe
' @diagnostics: private-member-access@13
' @requires: módulo "mod_vault" exportando a classe Vault com campo Private "secret"
'
Imports mod_vault

Namespace mod_consumer
   Class TConsumer
      Public Sub Run()
         Dim v As Vault
         ' "secret" é Private dentro de Vault — acessar daqui dispara o diagnóstico
         v.secret = "y"
      End Sub
   End Class
End Namespace
